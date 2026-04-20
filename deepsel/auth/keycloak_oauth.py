import logging
from fastapi import HTTPException, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from deepsel.auth.types import OAuthUserResult

logger = logging.getLogger(__name__)


class KeycloakOAuthService:
    """
    Keycloak OIDC authentication service (auth-only, no 2-way sync).
    Uses python-keycloak library following the proven nativeservice pattern.

    Flow: Keycloak redirects to a frontend URL with ?code=&state=,
    then frontend POSTs code+state to backend to exchange for session.
    """

    def __init__(
        self,
        app_secret: str,
        auth_algorithm: str,
        frontend_url: str,
        callback_path: str = "/admin/keycloak-callback",
    ):
        self.app_secret = app_secret
        self.auth_algorithm = auth_algorithm
        self.frontend_url = frontend_url
        self.callback_path = callback_path

    def _get_keycloak_client(self, organization):
        from keycloak import KeycloakOpenID

        if not organization.is_enabled_keycloak:
            return None

        if not all(
            [
                organization.keycloak_server_url,
                organization.keycloak_realm_name,
                organization.keycloak_client_id,
                organization.keycloak_client_secret,
            ]
        ):
            return None

        return KeycloakOpenID(
            server_url=organization.keycloak_server_url,
            client_id=organization.keycloak_client_id,
            realm_name=organization.keycloak_realm_name,
            client_secret_key=organization.keycloak_client_secret,
        )

    def _build_redirect_uri(self, origin: str = "") -> str:
        base = origin or self.frontend_url
        return f"{base}{self.callback_path}"

    def initiate_login(
        self, db: Session, organization_id: int, origin: str = ""
    ) -> RedirectResponse:
        from deepsel.utils.models_pool import models_pool

        OrganizationModel = models_pool["organization"]

        organization = db.query(OrganizationModel).get(organization_id)
        if not organization:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Organization not found",
            )

        keycloak_client = self._get_keycloak_client(organization)
        if not keycloak_client:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Keycloak authentication not configured",
            )

        try:
            redirect_uri = self._build_redirect_uri(origin)
            auth_url = keycloak_client.auth_url(
                redirect_uri=redirect_uri,
                scope="openid email profile",
                state=str(organization_id),
            )
            # Force login prompt so user can switch Keycloak accounts
            auth_url += "&prompt=login"
            return RedirectResponse(auth_url)
        except Exception as e:
            logger.error(f"Keycloak auth URL error: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Authentication service error",
            )

    def handle_callback(
        self, code: str, state: str, db: Session, origin: str = ""
    ) -> OAuthUserResult:
        from deepsel.auth.service import AuthService
        from deepsel.utils.models_pool import models_pool

        UserModel = models_pool["user"]
        OrganizationModel = models_pool["organization"]
        RoleModel = models_pool["role"]

        organization_id = int(state)
        organization = db.query(OrganizationModel).get(organization_id)
        if not organization:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Organization not found",
            )

        keycloak_client = self._get_keycloak_client(organization)
        if not keycloak_client:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Keycloak authentication not configured",
            )

        try:
            redirect_uri = self._build_redirect_uri(origin)
            token = keycloak_client.token(
                grant_type=["authorization_code"],
                code=code,
                redirect_uri=redirect_uri,
            )

            user_info = keycloak_client.userinfo(token["access_token"])

            keycloak_sub = user_info["sub"]
            keycloak_email = user_info.get("email")
            keycloak_name = user_info.get(
                "name", user_info.get("preferred_username", "")
            )

            # Find user by keycloak_id
            user = (
                db.query(UserModel)
                .filter_by(keycloak_id=keycloak_sub, organization_id=organization_id)
                .first()
            )

            if not user and keycloak_email:
                # Check if user exists with same email in this org
                existing_user = (
                    db.query(UserModel)
                    .filter_by(email=keycloak_email, organization_id=organization_id)
                    .first()
                )

                if existing_user:
                    existing_user.keycloak_id = keycloak_sub
                    user = existing_user
                else:
                    # Create new user
                    user = UserModel(
                        username=user_info.get("preferred_username", keycloak_email),
                        email=keycloak_email,
                        name=keycloak_name,
                        keycloak_id=keycloak_sub,
                        organization_id=organization_id,
                        signed_up=True,
                    )
                    db.add(user)

                db.commit()
                db.refresh(user)

                # Assign default role for new users
                if not existing_user:
                    default_role_id = getattr(
                        organization, "keycloak_default_role", None
                    ) or "website_editor_role"
                    role = (
                        db.query(RoleModel)
                        .filter(RoleModel.string_id == default_role_id)
                        .first()
                    )
                    if role:
                        user.roles.append(role)
                        db.commit()

            elif user:
                db.refresh(user)

            if not user:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Could not create or find user from Keycloak",
                )

            # Create access token
            auth_svc = AuthService(
                app_secret=self.app_secret,
                auth_algorithm=self.auth_algorithm,
                default_org_id=0,
                password_context=None,
                encrypt_fn=None,
                decrypt_fn=None,
            )
            access_token = auth_svc.create_access_token(
                user=user, organization=organization
            )

            return OAuthUserResult(
                user=user,
                organization=organization,
                access_token=access_token,
            )

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Keycloak callback error: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Authentication failed",
            )
