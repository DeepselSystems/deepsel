from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class LoginResult:
    access_token: str
    user: Any
    require_2fa_setup: bool = False


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
