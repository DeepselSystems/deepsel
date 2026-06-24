from dataclasses import dataclass, field
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


@dataclass
class LoginResult:
    access_token: str
    user: Any
    require_2fa_setup: bool = False
    session_id: Optional[str] = None


@dataclass
class SignupResult:
    success: bool
    user_id: int


@dataclass
class InitAnonResult:
    token: str
    user: Any


@dataclass
class ResetPasswordResult:
    success: bool
    recovery_codes: list[str] = field(default_factory=list)


@dataclass
class TwoFactorInfo:
    is_org_require_2fa: bool
    is_already_configured: bool
    totp_uri: str


@dataclass
class OAuthUserResult:
    user: Any
    organization: Any
    access_token: str
    relay_state: Optional[str] = None


class UserPreferences(BaseModel):
    """Typed schema for the user.preferences JSON column."""

    model_config = ConfigDict(extra="allow")

    last_used_organization_id: Optional[int] = None


class LoginOrganizationItem(BaseModel):
    """A single organization entry returned by the login org-selector endpoint."""

    id: int
    name: str


class LoginOrganizationsResponse(BaseModel):
    """Response from the /login/organizations endpoint."""

    organizations: list[LoginOrganizationItem]
    last_used_organization_id: Optional[int] = None
