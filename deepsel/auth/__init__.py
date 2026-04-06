def __getattr__(name):
    if name == "AuthService":
        from .service import AuthService

        globals()["AuthService"] = AuthService
        return AuthService
    if name == "GoogleOAuthService":
        from .google_oauth import GoogleOAuthService

        globals()["GoogleOAuthService"] = GoogleOAuthService
        return GoogleOAuthService
    if name == "SamlService":
        from .saml import SamlService

        globals()["SamlService"] = SamlService
        return SamlService
    if name in ("SessionStore", "create_session_store"):
        from . import session as _session_mod

        val = getattr(_session_mod, name)
        globals()[name] = val
        return val
    if name in (
        "LoginResult",
        "SignupResult",
        "InitAnonResult",
        "ResetPasswordResult",
        "TwoFactorInfo",
        "OAuthUserResult",
    ):
        from . import types

        val = getattr(types, name)
        globals()[name] = val
        return val
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


__all__ = [
    "AuthService",
    "GoogleOAuthService",
    "SamlService",
    "SessionStore",
    "create_session_store",
    "LoginResult",
    "SignupResult",
    "InitAnonResult",
    "ResetPasswordResult",
    "TwoFactorInfo",
    "OAuthUserResult",
]
