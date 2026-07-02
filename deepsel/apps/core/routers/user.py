import json
import logging
from typing import Annotated, Any
import pyotp
from fastapi import BackgroundTasks, Body, Depends, HTTPException, status
from sqlalchemy.orm import Session
from db import get_db
from settings import APP_SECRET
from deepsel.utils.crypto import (
    encrypt as _encrypt,
    decrypt as _decrypt,
    generate_recovery_codes,
    hash_text,
)
from deepsel.utils.crud_router import CALLABLE, CRUDRouter
from deepsel.auth.get_current_user import get_current_user
from deepsel.utils.models_pool import models_pool
from deepsel.apps.core.schemas.user import (
    CurrentUser,
    Info2Fa,
    UserRead,
    UserSearch,
    UserCreate,
    UserUpdate,
)

logger = logging.getLogger(__name__)

table_name = "user"
Model = models_pool[table_name]
RoleModel = models_pool["role"]
EmailTemplateModel = models_pool["email_template"]
OrganizationModel = models_pool["organization"]


class UserCustomRouter(CRUDRouter):
    def _create(self, *args: Any, **kwargs: Any) -> CALLABLE:
        def route(
            model: self.create_schema,  # type: ignore
            background_tasks: BackgroundTasks,
            db: Session = Depends(self.get_db),
            user: Model = Depends(get_current_user),
        ) -> [Model]:
            values = model.dict()
            username = values.get("username")
            if username:
                # check if username already exists, including lowercase
                if db.query(Model).filter(Model.username.ilike(username)).first():
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="Username already exists",
                    )

            password = values.pop("password", None)
            new_user = self.db_model.create(db, user, values)

            if password:
                new_user.hashed_password = Model._get_password_context().hash(password)
                db.commit()
            else:
                # send password setup email to new user
                background_tasks.add_task(new_user.send_set_password_email, db)

            return new_user

        return route


router = UserCustomRouter(
    read_schema=UserRead,
    search_schema=UserSearch,
    create_schema=UserCreate,
    update_schema=UserUpdate,
    table_name=table_name,
    dependencies=[Depends(get_current_user)],
)


@router.get("/util/me", response_model=CurrentUser)
def get_me(user: Model = Depends(get_current_user)):
    permissions = user.get_user_permissions()
    all_roles = (
        user.get_user_roles()
    )  # list of all explicitly assigned roles and implied roles, recursively

    current_user = CurrentUser(
        **UserRead.model_validate(user).model_dump(),  # return without password
        permissions=permissions,
        all_roles=all_roles,
    )
    return current_user


@router.put("/me/2fa-config")
def update_2fa_config(
    action: Annotated[str, Body(embed=True)],
    otp: Annotated[str, Body(embed=True)] = None,
    user: Model = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Info2Fa:
    """Manage 2FA configuration.

    Actions:
        setup   — generate temp TOTP secret, return QR code URI
        confirm — verify OTP against temp secret, activate 2FA, return recovery codes
        disable — verify OTP against active secret, deactivate 2FA
    """
    if action == "setup":
        # Generate a new temp secret (does NOT activate 2FA yet)
        secret_key = pyotp.random_base32()
        user.temp_secret_key_2fa = _encrypt(secret_key, APP_SECRET)
        db.commit()

        current_org_id = getattr(user, "current_organization_id", None)
        if current_org_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="X-Organization-Id header required for 2FA setup",
            )
        org = db.query(OrganizationModel).get(current_org_id)
        issuer_name = org.name if org else ""
        totp_uri = pyotp.totp.TOTP(secret_key).provisioning_uri(
            name=user.email or user.username, issuer_name=issuer_name
        )
        return Info2Fa(totp_uri=totp_uri)

    elif action == "confirm":
        # Verify OTP against temp secret, then activate 2FA
        if not user.temp_secret_key_2fa:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No 2FA setup in progress. Call with action='setup' first.",
            )
        if not otp:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="OTP is required",
            )

        temp_secret = _decrypt(user.temp_secret_key_2fa, APP_SECRET)
        if isinstance(temp_secret, bytes):
            temp_secret = temp_secret.decode("utf-8")

        totp = pyotp.TOTP(temp_secret)
        if not totp.verify(otp):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Invalid OTP. Please scan the QR code and try again.",
            )

        # OTP verified — commit the secret and activate 2FA
        user.secret_key_2fa = user.temp_secret_key_2fa
        user.temp_secret_key_2fa = None
        user.is_use_2fa = True

        # Generate recovery codes
        recovery_codes = generate_recovery_codes()
        hashed_codes = [hash_text(code) for code in recovery_codes]
        user.recovery_codes = json.dumps(hashed_codes)
        db.commit()

        return Info2Fa(is_use_2fa=True, recovery_codes=recovery_codes)

    elif action == "disable":
        if not user.is_use_2fa:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="2FA is not enabled",
            )
        if not otp:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="OTP is required to disable 2FA",
            )

        secret = _decrypt(user.secret_key_2fa, APP_SECRET)
        if isinstance(secret, bytes):
            secret = secret.decode("utf-8")

        totp = pyotp.TOTP(secret)
        if not totp.verify(otp):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Invalid OTP",
            )

        user.is_use_2fa = False
        user.secret_key_2fa = None
        user.temp_secret_key_2fa = None
        user.recovery_codes = None
        db.commit()

        return Info2Fa(is_use_2fa=False)

    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown action '{action}'. Use 'setup', 'confirm', or 'disable'.",
        )


@router.get("/me/2fa-config")
def get_2fa_config(
    user: Model = Depends(get_current_user),
) -> Info2Fa:
    return Info2Fa(is_use_2fa=user.is_use_2fa)
