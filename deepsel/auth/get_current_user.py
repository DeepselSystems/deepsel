import os
from typing import Optional
import jwt
from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from deepsel.auth.current_org import resolve_current_organization_id
from jwt import PyJWTError
from sqlalchemy.orm import Session
from deepsel import deps
from deepsel.utils.models_pool import models_pool

# tokenUrl is cosmetic (only the Swagger "Authorize" URL); token extraction is
# prefix-independent. Read the prefix from the environment so we don't depend on
# deps.settings being configured at import time.
oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl=f"{os.getenv('API_PREFIX', '/api/v1')}/token", auto_error=False
)


def _get_db():
    """Delegate to the consumer's get_db dependency, injected via configure_deps."""
    yield from deps.get_db()


def _get_session_store(request: Request):
    """Get session store from app state, or None if not initialized."""
    return getattr(request.app.state, "session_store", None)


def _resolve_user_from_session(request: Request, db: Session):
    """Try to authenticate via session cookie. Returns user or None."""
    session_id = request.cookies.get(deps.settings.SESSION_COOKIE_NAME)
    if not session_id:
        return None

    session_store = _get_session_store(request)
    if not session_store:
        return None

    session_data = session_store.get(session_id)
    if session_data is None:
        return None

    UserModel = models_pool["user"]
    user = db.query(UserModel).get(session_data.user_id)
    return user


def _attach_current_org(user, x_organization_id: Optional[int]) -> None:
    """Validate and attach the requested current org to the user object."""
    user.current_organization_id = resolve_current_organization_id(
        user, x_organization_id
    )


def get_current_user(
    request: Request,
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(_get_db),
    x_organization_id: Optional[int] = Header(default=None, alias="X-Organization-Id"),
):
    UserModel = models_pool["user"]
    OrgModel = models_pool["organization"]
    org = db.query(OrgModel).get(deps.settings.DEFAULT_ORG_ID)

    if deps.settings.AUTHLESS and org and not org.enable_auth:
        # Return admin user when AUTHLESS=True
        user = (
            db.query(UserModel)
            .filter_by(
                string_id="admin_user",
            )
            .first()
        )
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="No admin user found for authless mode",
                headers={"WWW-Authenticate": "Bearer"},
            )
        _attach_current_org(user, x_organization_id)
        return user

    # 1. Try session cookie first (browser requests)
    session_user = _resolve_user_from_session(request, db)
    if session_user is not None:
        _attach_current_org(session_user, x_organization_id)
        return session_user

    # 2. Fall back to Bearer token (API clients, backward compat)
    if token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = jwt.decode(
            token, deps.settings.APP_SECRET, algorithms=[deps.settings.AUTH_ALGORITHM]
        )
        owner_id: str = payload.get("uid")
        if not owner_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials payload",
            )
    except PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    user = db.query(UserModel).get(owner_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate user",
        )

    anon_only = payload.get("anon_only", False)
    if user.signed_up and anon_only:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credentials are only valid for anonymous users",
        )
    # If header is absent, fall back to the org encoded in the token.
    org_id = (
        x_organization_id if x_organization_id is not None else payload.get("org_id")
    )
    _attach_current_org(user, org_id)
    return user


def get_current_user_optional(
    request: Request,
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(_get_db),
    x_organization_id: Optional[int] = Header(default=None, alias="X-Organization-Id"),
):
    """
    Optional authentication - returns user if authenticated, None if not.
    Does not raise exceptions for missing or invalid tokens.
    """
    UserModel = models_pool["user"]

    # 1. Try session cookie
    session_user = _resolve_user_from_session(request, db)
    if session_user is not None:
        _attach_current_org(session_user, x_organization_id)
        return session_user

    # 2. Try Bearer token
    if token is None:
        return None

    try:
        payload = jwt.decode(
            token, deps.settings.APP_SECRET, algorithms=[deps.settings.AUTH_ALGORITHM]
        )
        owner_id: str = payload.get("uid")
        if not owner_id:
            return None
    except PyJWTError:
        return None

    user = db.query(UserModel).get(owner_id)
    if user is None:
        return None

    anon_only = payload.get("anon_only", False)
    if user.signed_up and anon_only:
        return None

    org_id = (
        x_organization_id if x_organization_id is not None else payload.get("org_id")
    )
    _attach_current_org(user, org_id)
    return user
