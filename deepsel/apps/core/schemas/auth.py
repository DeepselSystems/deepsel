from typing import Optional
from uuid import UUID

from pydantic import BaseModel

from deepsel.apps.core.schemas.user import CurrentUser
from deepsel.utils.generate_crud_schemas import generate_read_schema
from deepsel.utils.models_pool import models_pool

UserModel = models_pool["user"]
UserReadSchema = generate_read_schema(UserModel)


class UserInitSubmission(BaseModel):
    device_info: dict
    organization_id: int
    anonymous_id: UUID


class UserSignupSubmission(BaseModel):
    email: str
    password: str
    organization_id: int
    token: Optional[str] = None


class TokenResponse(BaseModel):
    access_token: str
    user: CurrentUser | None
    is_require_user_config_2fa: bool


class InitAnonymousUserResponse(BaseModel):
    token: str
    user: UserReadSchema


class SignupResponse(BaseModel):
    success: bool
    id: int


class ResetPasswordResponse(BaseModel):
    success: bool
    recovery_codes: list[str] = []


class ResetPasswordRequestSubmission(BaseModel):
    mixin_id: str  # email or username
    organization_id: int


class ResetPasswordSubmission(BaseModel):
    token: str
    new_password: str
    should_confirm_2fa_when_change_password: bool = False
    crosscheck_otp: str = None


class ChangePasswordSubmission(BaseModel):
    old_password: str
    new_password: str


class GoogleUser(BaseModel):
    sub: str
    email: str
    name: str


class SamlUser(BaseModel):
    nameid: str
    email: str
    name: Optional[str] = None


class Info2FaDto(BaseModel):
    is_organization_require_2fa: bool = False
    is_already_config_2fa: bool = False
    totp_uri: str = ""
