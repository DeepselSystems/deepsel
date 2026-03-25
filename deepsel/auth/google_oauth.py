import logging

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from deepsel.auth.types import OAuthUserResult

logger = logging.getLogger(__name__)


class GoogleOAuthService:
    def __init__(self, app_secret: str, auth_algorithm: str, frontend_url: str):
        self.app_secret = app_secret
        self.auth_algorithm = auth_algorithm
        self.frontend_url = frontend_url

    def build_oauth_client(self, db: Session):
        from authlib.integrations.starlette_client import OAuth
        from starlette.config import Config

        from deepsel.utils.models_pool import models_pool

        OrganizationModel = models_pool["organization"]

        organization = (
            db.query(OrganizationModel)
            .filter(OrganizationModel.string_id == "1")
            .first()
        )
        if (
            not organization
            or not organization.google_client_id
            or not organization.google_client_secret
            or not organization.google_redirect_uri
        ):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="OAuth configuration is missing.",
            )
        config_data = {
            "GOOGLE_CLIENT_ID": organization.google_client_id,
            "GOOGLE_CLIENT_SECRET": organization.google_client_secret,
        }
        starlette_config = Config(environ=config_data)
        oauth = OAuth(starlette_config)
        oauth.register(
            name="google",
            server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
            client_kwargs={"scope": "openid email profile"},
        )
        return oauth, organization.google_redirect_uri

    async def initiate_login(self, request, db: Session):
        oauth, redirect_uri = self.build_oauth_client(db)
        return await oauth.google.authorize_redirect(request, redirect_uri)

    async def handle_callback(self, request, db: Session) -> OAuthUserResult:
        from authlib.integrations.base_client import OAuthError
        from authlib.oauth2.rfc6749 import OAuth2Token

        from deepsel.auth.service import AuthService
        from deepsel.utils.models_pool import models_pool

        UserModel = models_pool["user"]
        OrganizationModel = models_pool["organization"]
        RoleModel = models_pool["role"]

        try:
            oauth, _ = self.build_oauth_client(db)
            user_response: OAuth2Token = await oauth.google.authorize_access_token(
                request
            )
        except OAuthError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
            )

        user_info = user_response.get("userinfo")
        google_email = user_info.get("email")
        google_sub = user_info.get("sub")
        google_name = user_info.get("name")

        existing_user = (
            db.query(UserModel).filter(UserModel.email == google_email).one_or_none()
        )
        if existing_user:
            organization = existing_user.organization
            user = existing_user
            user.google_id = google_sub
            db.commit()
        else:
            organization = (
                db.query(OrganizationModel)
                .filter(OrganizationModel.string_id == "1")
                .one_or_none()
            )
            user = UserModel(
                username=google_email,
                email=google_email,
                name=google_name,
                google_id=google_sub,
                signed_up=True,
                organization_id=organization.id if organization else 1,
            )
            db.add(user)
            db.commit()
            db.refresh(user)

            role = (
                db.query(RoleModel).filter(RoleModel.string_id == "user_role").first()
            )
            if role:
                user.roles.append(role)
                db.commit()

        # Create access token using a temporary AuthService
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
