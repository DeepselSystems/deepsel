import logging
from typing import Optional
from urllib.parse import quote

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from deepsel.auth.types import OAuthUserResult

logger = logging.getLogger(__name__)


class SamlService:
    def __init__(
        self,
        app_secret: str,
        auth_algorithm: str,
        default_org_id: int,
        backend_url: str,
        frontend_url: str,
    ):
        self.app_secret = app_secret
        self.auth_algorithm = auth_algorithm
        self.default_org_id = default_org_id
        self.backend_url = backend_url
        self.frontend_url = frontend_url

    @staticmethod
    def normalize_x509_certificate(cert_content: str) -> str:
        if not cert_content or not cert_content.strip():
            return ""

        cert_clean = cert_content.strip()

        has_begin = cert_clean.startswith("-----BEGIN CERTIFICATE-----")
        has_end = cert_clean.endswith("-----END CERTIFICATE-----")

        if has_begin and has_end:
            return cert_content

        if not has_begin:
            cert_clean = "-----BEGIN CERTIFICATE-----\n" + cert_clean
        if not has_end:
            cert_clean = cert_clean + "\n-----END CERTIFICATE-----"

        return cert_clean

    def get_settings(self, db: Session, require_idp: bool = True) -> dict:
        from deepsel.utils.models_pool import models_pool

        OrganizationModel = models_pool["organization"]

        organization = (
            db.query(OrganizationModel)
            .filter(OrganizationModel.id == self.default_org_id)
            .first()
        )
        if not organization:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Organization not found.",
            )

        if require_idp and (
            not organization.saml_idp_entity_id
            or not organization.saml_idp_sso_url
            or not organization.saml_idp_x509_cert
        ):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="SAML IdP configuration is missing.",
            )

        return {
            "sp": {
                "entityId": organization.saml_sp_entity_id
                or f"{self.backend_url}/saml/metadata",
                "assertionConsumerService": {
                    "url": organization.saml_sp_acs_url
                    or f"{self.backend_url}/auth/saml",
                    "binding": "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST",
                },
                "singleLogoutService": {
                    "url": organization.saml_sp_sls_url
                    or f"{self.backend_url}/sls/saml",
                    "binding": "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
                },
                "NameIDFormat": "urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified",
                "x509cert": "",
                "privateKey": "",
            },
            "security": {
                "nameIdEncrypted": False,
                "authnRequestsSigned": False,
                "logoutRequestSigned": False,
                "logoutResponseSigned": False,
                "signMetadata": False,
                "wantAssertionsSigned": True,
                "wantNameId": True,
                "wantAssertionsEncrypted": False,
                "wantNameIdEncrypted": False,
                "requestedAuthnContext": False,
                "allowRepeatAttributeName": True,
                "signatureAlgorithm": "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
                "digestAlgorithm": "http://www.w3.org/2001/04/xmlenc#sha256",
            },
            "idp": {
                "entityId": organization.saml_idp_entity_id or "",
                "singleSignOnService": {
                    "url": organization.saml_idp_sso_url or "",
                    "binding": "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
                },
                "singleLogoutService": {
                    "url": "",
                    "binding": "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
                },
                "x509cert": self.normalize_x509_certificate(
                    organization.saml_idp_x509_cert or ""
                ),
            },
        }

    def init_auth(self, request_data: dict, db: Session):
        from onelogin.saml2.auth import OneLogin_Saml2_Auth

        settings = self.get_settings(db)
        return OneLogin_Saml2_Auth(request_data, settings)

    @staticmethod
    def prepare_request(request) -> dict:
        return {
            "https": "on" if request.url.scheme == "https" else "off",
            "http_host": request.headers.get("host", ""),
            "server_port": str(
                request.url.port or (443 if request.url.scheme == "https" else 80)
            ),
            "script_name": request.url.path,
            "get_data": dict(request.query_params),
            "post_data": {},
        }

    async def initiate_login(
        self, request, db: Session, redirect: Optional[str] = None
    ) -> str:
        try:
            req = self.prepare_request(request)
            auth = self.init_auth(req, db)
            return auth.login(return_to=redirect)
        except Exception as e:
            logger.error(f"Error initiating SAML login: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to initiate SAML authentication",
            )

    async def handle_assertion(self, request, db: Session) -> OAuthUserResult:
        from deepsel.auth.service import AuthService
        from deepsel.utils.models_pool import models_pool

        UserModel = models_pool["user"]
        OrganizationModel = models_pool["organization"]
        RoleModel = models_pool["role"]

        try:
            form = await request.form()
            req = self.prepare_request(request)
            req["post_data"] = dict(form)

            auth = self.init_auth(req, db)
            auth.process_response()

            errors = auth.get_errors()

            if len(errors) != 0:
                logger.error(f"SAML authentication errors: {errors}")
                logger.error(f"SAML last error reason: {auth.get_last_error_reason()}")
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail=f"SAML authentication failed: {', '.join(errors)}",
                )

            attrs = auth.get_attributes()
            nameid = auth.get_nameid()

            saml_organization = (
                db.query(OrganizationModel)
                .filter(OrganizationModel.string_id == "1")
                .first()
            )

            attr_mapping = saml_organization.saml_attribute_mapping or {}

            email_attr = attr_mapping.get(
                "email",
                "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
            )
            name_attr = attr_mapping.get(
                "name",
                "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name",
            )

            email = (
                attrs.get(email_attr, [nameid])[0] if attrs.get(email_attr) else nameid
            )
            name = attrs.get(name_attr, [""])[0] if attrs.get(name_attr) else ""

            if not email:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Email attribute not found in SAML response",
                )

            # Find or create user
            existing_user = None
            if email and email != nameid:
                existing_user = (
                    db.query(UserModel).filter(UserModel.email == email).one_or_none()
                )
            if not existing_user:
                existing_user = (
                    db.query(UserModel)
                    .filter(UserModel.username == nameid)
                    .one_or_none()
                )

            if existing_user:
                user = existing_user
                organization = existing_user.organization
                user.saml_nameid = nameid
                if name and not user.name:
                    user.name = name
                db.commit()
            else:
                organization = saml_organization
                user = UserModel(
                    email=email,
                    name=name,
                    saml_nameid=nameid,
                    signed_up=True,
                    organization_id=organization.id if organization else 1,
                )
                db.add(user)
                db.commit()
                db.refresh(user)

                role = (
                    db.query(RoleModel)
                    .filter(RoleModel.string_id == "user_role")
                    .first()
                )
                if role:
                    user.roles.append(role)
                    db.commit()

            auth_svc = AuthService(
                app_secret=self.app_secret,
                auth_algorithm=self.auth_algorithm,
                default_org_id=self.default_org_id,
                password_context=None,
                encrypt_fn=None,
                decrypt_fn=None,
            )
            access_token = auth_svc.create_access_token(
                user=user, organization=organization
            )

            relay_state = req["post_data"].get("RelayState")

            return OAuthUserResult(
                user=user,
                organization=organization,
                access_token=access_token,
                relay_state=relay_state,
            )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"SAML authentication error: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="SAML authentication failed",
            )

    def get_metadata(self, db: Session) -> str:
        from onelogin.saml2.settings import OneLogin_Saml2_Settings

        try:
            settings_dict = self.get_settings(db, require_idp=False)
            settings = OneLogin_Saml2_Settings(settings_dict)
            metadata = settings.get_sp_metadata()

            if metadata:
                return metadata
            else:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to generate SAML metadata - empty result",
                )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error generating SAML metadata: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to generate SAML metadata",
            )
