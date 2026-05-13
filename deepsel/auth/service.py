import json
import logging
from datetime import UTC, datetime, timedelta
from typing import Callable, Optional
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from deepsel.auth.types import (
    InitAnonResult,
    LoginResult,
    ResetPasswordResult,
    SignupResult,
    TwoFactorInfo,
)
from deepsel.utils.crypto import (
    generate_recovery_codes,
    get_valid_recovery_code_index,
    hash_text,
)

logger = logging.getLogger(__name__)


class AuthService:
    def __init__(
        self,
        app_secret: str,
        auth_algorithm: str,
        default_org_id: int,
        password_context,
        encrypt_fn: Callable[[str], str],
        decrypt_fn: Callable[[str], str],
        session_store=None,
    ):
        self.app_secret = app_secret
        self.auth_algorithm = auth_algorithm
        self.default_org_id = default_org_id
        self.password_context = password_context
        self.encrypt_fn = encrypt_fn
        self.decrypt_fn = decrypt_fn
        self.session_store = session_store

    def _decode_token(self, token: str) -> dict:
        import jwt

        try:
            payload = jwt.decode(
                token, self.app_secret, algorithms=[self.auth_algorithm]
            )
            owner_id = payload.get("uid")
            if not owner_id:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid credentials payload",
                )
            return payload
        except jwt.PyJWTError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
            )

    def _get_org_token_expire_minutes(self, db: Session, organization_id: int) -> int:
        from deepsel.utils.models_pool import models_pool

        OrganizationModel = models_pool["organization"]
        organization = db.query(OrganizationModel).get(organization_id)
        if organization and organization.access_token_expire_minutes:
            return organization.access_token_expire_minutes
        return 60 * 24

    def create_access_token(
        self,
        user,
        organization_id: int,
        db: Optional[Session] = None,
    ) -> str:
        import jwt

        access_token_expire_minutes = 60 * 24
        if db is not None:
            access_token_expire_minutes = self._get_org_token_expire_minutes(
                db, organization_id
            )

        access_token_expires = timedelta(minutes=access_token_expire_minutes)
        access_token = jwt.encode(
            {
                "uid": user.id,
                "org_id": organization_id,
                "exp": datetime.now(UTC) + access_token_expires,
            },
            self.app_secret,
            algorithm=self.auth_algorithm,
        )
        return access_token

    def _assign_public_role(self, db: Session, user, organization_id: int):
        from deepsel.utils.models_pool import models_pool

        RoleModel = models_pool["role"]

        org_public_role = (
            db.query(RoleModel)
            .filter_by(string_id="public_role", organization_id=organization_id)
            .first()
        )

        if org_public_role:
            user.roles.append(org_public_role)
        else:
            default_public_role = (
                db.query(RoleModel)
                .filter_by(string_id="public_role", organization_id=self.default_org_id)
                .first()
            )
            if default_public_role:
                user.roles.append(default_public_role)
            else:
                public_role = (
                    db.query(RoleModel).filter_by(string_id="public_role").first()
                )
                if public_role:
                    user.roles.append(public_role)

    def _link_user_to_org(self, db: Session, user, organization_id: int):
        """Append the org to user.organizations if not already linked."""
        from deepsel.utils.models_pool import models_pool

        OrganizationModel = models_pool["organization"]
        org = db.query(OrganizationModel).get(organization_id)
        if org is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Organization {organization_id} not found",
            )
        if org not in user.organizations:
            user.organizations.append(org)

    def login(
        self,
        db: Session,
        organization_id: int,
        identifier: str,
        password: str,
        otp: Optional[str] = None,
    ) -> LoginResult:
        import jwt
        import pyotp

        from deepsel.utils.models_pool import models_pool

        UserModel = models_pool["user"]
        OrganizationModel = models_pool["organization"]

        user = UserModel.authenticate_user(db, identifier, password)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # verify the user is a member of the requested org
        if organization_id not in user.get_org_ids():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User is not a member of the requested organization",
            )

        # verify 2FA
        if user.is_use_2fa:
            totp = pyotp.TOTP(self.decrypt_fn(user.secret_key_2fa))
            if not totp.verify(otp):
                # check recovery codes if otp is invalid
                recovery_codes = json.loads(user.recovery_codes or "[]")
                code_index = get_valid_recovery_code_index(otp, recovery_codes)
                if code_index == -1:
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Incorrect OTP",
                        headers={"WWW-Authenticate": "Bearer"},
                    )
                else:
                    recovery_codes.pop(code_index)
                    user.recovery_codes = (
                        json.dumps(recovery_codes) if len(recovery_codes) else None
                    )
                    db.commit()
        else:
            organization = db.query(OrganizationModel).get(organization_id)
            if organization and organization.require_2fa_all_users:
                return LoginResult(
                    access_token="",  # nosec B106
                    user=None,
                    require_2fa_setup=True,
                )

        access_token_expire_minutes = self._get_org_token_expire_minutes(
            db, organization_id
        )

        access_token_expires = timedelta(minutes=access_token_expire_minutes)
        access_token = jwt.encode(
            {
                "uid": user.id,
                "org_id": organization_id,
                "exp": datetime.now(UTC) + access_token_expires,
            },
            self.app_secret,
            algorithm=self.auth_algorithm,
        )

        session_id = None
        if self.session_store:
            ttl = int(access_token_expire_minutes * 60)
            session = self.session_store.create(user_id=user.id, ttl_seconds=ttl)
            session_id = session.session_id

        return LoginResult(
            access_token=access_token,
            user=user,
            require_2fa_setup=False,
            session_id=session_id,
        )

    # ------------------------------------------------------------------
    # Session management
    # ------------------------------------------------------------------

    def create_session(
        self,
        user,
        organization_id: int,
        db: Optional[Session] = None,
        ip: str = "",
        user_agent: str = "",
    ) -> Optional[str]:
        """Create a server-side session for the user. Returns session_id or None."""
        if not self.session_store:
            return None

        ttl_minutes = 60 * 24
        if db is not None:
            ttl_minutes = self._get_org_token_expire_minutes(db, organization_id)

        session = self.session_store.create(
            user_id=user.id,
            ttl_seconds=int(ttl_minutes * 60),
            ip=ip,
            user_agent=user_agent,
        )
        return session.session_id

    def validate_session(self, session_id: str) -> Optional[dict]:
        """Validate a session ID. Returns session data dict or None."""
        if not self.session_store:
            return None
        session = self.session_store.get(session_id)
        if session is None:
            return None
        return session.to_dict()

    def invalidate_session(self, session_id: str) -> None:
        """Delete a single session."""
        if self.session_store:
            self.session_store.delete(session_id)

    def invalidate_user_sessions(self, user_id: int) -> int:
        """Delete all sessions for a user. Returns count deleted."""
        if not self.session_store:
            return 0
        return self.session_store.delete_for_user(user_id)

    def signup(
        self,
        db: Session,
        email: str,
        password: str,
        organization_id: int,
        invitation_token: Optional[str] = None,
    ) -> SignupResult:
        import jwt

        from deepsel.utils.models_pool import models_pool

        UserModel = models_pool["user"]

        existing_user = db.query(UserModel).filter(UserModel.email == email).first()
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already exists",
            )

        hashed_password = self.password_context.hash(password)

        if invitation_token:
            decoded_token = jwt.decode(
                invitation_token,
                self.app_secret,
                algorithms=[self.auth_algorithm],
            )
            owner_id = decoded_token["uid"]
            user = db.query(UserModel).get(owner_id)
            if not user:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="User not found",
                )

            user.email = email
            user.hashed_password = hashed_password
            user.signed_up = True
        else:
            user = UserModel(
                email=email,
                hashed_password=hashed_password,
                signed_up=True,
            )
            db.add(user)

        db.flush()
        self._link_user_to_org(db, user, organization_id)
        db.commit()
        db.refresh(user)

        self._assign_public_role(db, user, organization_id)
        db.commit()

        return SignupResult(success=True, user_id=user.id)

    def init_anonymous_user(
        self, db: Session, anonymous_id: str, organization_id: int, **extra_data
    ) -> InitAnonResult:
        import jwt

        from deepsel.utils.models_pool import models_pool

        UserModel = models_pool["user"]

        user = (
            db.query(UserModel).filter(UserModel.anonymous_id == anonymous_id).first()
        )
        if not user:
            anon_username = f"user-{anonymous_id}"
            data = {
                "username": anon_username,
                "email": anon_username,
                "anonymous_id": anonymous_id,
                "hashed_password": self.password_context.hash(str(uuid4())),
                **extra_data,
            }

            user = UserModel(**data)
            db.add(user)
            db.flush()
            self._link_user_to_org(db, user, organization_id)
            self._assign_public_role(db, user, organization_id)
            db.commit()
            db.refresh(user)

        # create anon token that never expires
        token = jwt.encode(
            {"uid": user.id, "org_id": organization_id, "anon_only": True},
            self.app_secret,
            algorithm=self.auth_algorithm,
        )

        return InitAnonResult(token=token, user=user)

    async def request_password_reset(
        self, db: Session, organization_id: int, identifier: str
    ) -> bool:
        from deepsel.utils.models_pool import models_pool

        UserModel = models_pool["user"]

        user = (
            db.query(UserModel)
            .filter(
                or_(
                    UserModel.username == identifier,
                    UserModel.email == identifier,
                )
            )
            .first()
        )
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Email/username does not exist",
            )
        if not user.email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User email is not configured",
            )

        return await user.email_reset_password(db, organization_id)

    def reset_password(
        self,
        db: Session,
        token: str,
        new_password: str,
        crosscheck_otp: Optional[str] = None,
        should_confirm_2fa: bool = False,
    ) -> ResetPasswordResult:
        import pyotp

        from deepsel.utils.models_pool import models_pool

        OrganizationModel = models_pool["organization"]
        UserModel = models_pool["user"]

        payload = self._decode_token(token)
        user = db.query(UserModel).get(payload["uid"])
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate user",
            )

        organization_id = payload.get("org_id")
        organization = (
            db.query(OrganizationModel).get(organization_id)
            if organization_id
            else None
        )

        require_2fa = bool(organization and organization.require_2fa_all_users)
        if user.temp_secret_key_2fa and (require_2fa or user.is_use_2fa):
            totp = pyotp.TOTP(self.decrypt_fn(user.temp_secret_key_2fa))
            if not crosscheck_otp or not totp.verify(crosscheck_otp):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="invalid OTP",
                )
            user.secret_key_2fa = user.temp_secret_key_2fa
            user.temp_secret_key_2fa = None

        user.hashed_password = self.password_context.hash(new_password)

        if should_confirm_2fa:
            user.is_use_2fa = True

        recovery_codes = generate_recovery_codes()
        hash_recovery_codes = [hash_text(code) for code in recovery_codes]
        user.recovery_codes = json.dumps(hash_recovery_codes)

        db.commit()

        return ResetPasswordResult(
            success=True,
            recovery_codes=recovery_codes if user.is_use_2fa else [],
        )

    def change_password(
        self, db: Session, user, old_password: str, new_password: str
    ) -> bool:
        is_verified = self.password_context.verify(old_password, user.hashed_password)
        if not is_verified:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid password",
            )
        user.hashed_password = self.password_context.hash(new_password)
        db.commit()
        return True

    def check_2fa_config(self, db: Session, token: str) -> TwoFactorInfo:
        """Check 2FA config for password-reset flow. Generates temp secret if needed."""
        import pyotp

        from deepsel.utils.models_pool import models_pool

        OrganizationModel = models_pool["organization"]
        UserModel = models_pool["user"]

        payload = self._decode_token(token)
        user = db.query(UserModel).get(payload["uid"])
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate user",
            )

        organization_id = payload.get("org_id")
        organization = (
            db.query(OrganizationModel).get(organization_id)
            if organization_id
            else None
        )
        is_organization_require_2fa = bool(
            organization and organization.require_2fa_all_users
        )

        if not user.is_use_2fa and not is_organization_require_2fa:
            return TwoFactorInfo(
                is_org_require_2fa=False,
                is_already_configured=False,
                totp_uri="",
            )

        # Reuse existing temp secret if one exists, otherwise generate new
        if user.temp_secret_key_2fa:
            secret_key = self.decrypt_fn(user.temp_secret_key_2fa)
            if isinstance(secret_key, bytes):
                secret_key = secret_key.decode("utf-8")
        else:
            secret_key = pyotp.random_base32()
            user.temp_secret_key_2fa = self.encrypt_fn(secret_key)
            db.commit()

        issuer_name = organization.name if organization else ""
        totp_uri = pyotp.totp.TOTP(secret_key).provisioning_uri(
            name=user.email or user.username, issuer_name=issuer_name
        )
        return TwoFactorInfo(
            is_org_require_2fa=is_organization_require_2fa,
            is_already_configured=user.is_use_2fa,
            totp_uri=totp_uri,
        )
