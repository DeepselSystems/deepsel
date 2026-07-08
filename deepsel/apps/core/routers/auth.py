import logging
from typing import Optional
from urllib.parse import quote
from fastapi import Body, Depends, Form, Request, APIRouter, HTTPException
from fastapi.responses import RedirectResponse, Response
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import or_
from sqlalchemy.orm import Session
from typing_extensions import Annotated
from settings import (
    APP_SECRET,
    AUTH_ALGORITHM,
    DEFAULT_ORG_ID,
    PUBLIC_URL,
    SESSION_COOKIE_SECURE,
    SESSION_COOKIE_NAME,
    API_PREFIX,
)
from deepsel.deps import get_db
from deepsel.apps.core.schemas.user import CurrentUser
from deepsel.apps.core.schemas.auth import (
    UserInitSubmission,
    UserSignupSubmission,
    TokenResponse,
    InitAnonymousUserResponse,
    SignupResponse,
    ResetPasswordResponse,
    ResetPasswordRequestSubmission,
    ResetPasswordSubmission,
    ChangePasswordSubmission,
    Info2FaDto,
    UserReadSchema,
)
from deepsel.utils.crypto import encrypt, decrypt
from deepsel.auth.get_current_user import get_current_user
from deepsel.utils.models_pool import models_pool
from deepsel.utils.crypto import crypt_context as pwd_context
from deepsel.auth.service import AuthService
from deepsel.auth.saml import SamlService
from deepsel.auth.types import (
    LoginOrganizationItem,
    LoginOrganizationsResponse,
    UserPreferences,
)
from deepsel.auth.resolve_login_organization import resolve_login_organization_id

logger = logging.getLogger(__name__)

router = APIRouter(prefix=API_PREFIX, tags=["Authentication"])
UserModel = models_pool["user"]

auth_service = AuthService(
    app_secret=APP_SECRET,
    auth_algorithm=AUTH_ALGORITHM,
    default_org_id=DEFAULT_ORG_ID,
    password_context=pwd_context,
    encrypt_fn=lambda text: encrypt(text, APP_SECRET),
    decrypt_fn=lambda text: decrypt(text, APP_SECRET),
)
saml_service = SamlService(
    APP_SECRET, AUTH_ALGORITHM, DEFAULT_ORG_ID, PUBLIC_URL, PUBLIC_URL
)


def _get_session_store(request: Request):
    return getattr(request.app.state, "session_store", None)


def _set_session_cookie(response: Response, session_id: str, max_age: int):
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=session_id,
        httponly=True,
        secure=SESSION_COOKIE_SECURE,
        samesite="lax",
        max_age=max_age,
        path="/",
    )


def _clear_session_cookie(response: Response):
    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        httponly=True,
        secure=SESSION_COOKIE_SECURE,
        samesite="lax",
        path="/",
    )


def _build_current_user(user):
    permissions = user.get_user_permissions()
    all_roles = user.get_user_roles()
    return CurrentUser(
        **UserReadSchema.model_validate(user, from_attributes=True).dict(),
        permissions=permissions,
        all_roles=all_roles,
    )


@router.post("/token", response_model=TokenResponse)
def login_for_access_token(
    request: Request,
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    organization_id: Optional[int] = Form(None),
    db: Session = Depends(get_db),
    otp: Optional[str] = Form(None),
):
    # Inject session store if available
    session_store = _get_session_store(request)
    auth_service.session_store = session_store

    # Resolve organization: use supplied value or auto-detect from user membership
    resolved_org_id = (
        organization_id
        if organization_id is not None
        else resolve_login_organization_id(db, form_data.username, UserModel)
    )

    result = auth_service.login(
        db, resolved_org_id, form_data.username, form_data.password, otp
    )

    if result.require_2fa_setup:
        return TokenResponse(
            access_token="",  # nosec B106
            user=None,
            is_require_user_config_2fa=True,
        )

    # Build current user before committing so attributes remain loaded
    current_user = _build_current_user(result.user)

    # Persist last-used org in user preferences so future auto-resolve is accurate
    existing = UserPreferences.model_validate(result.user.preferences or {})
    existing.last_used_organization_id = resolved_org_id
    result.user.preferences = existing.model_dump()
    db.add(result.user)
    db.commit()

    response_data = TokenResponse(
        access_token=result.access_token,
        user=current_user,
        is_require_user_config_2fa=False,
    )

    # Set session cookie if session was created
    response = Response(
        content=response_data.model_dump_json(),
        media_type="application/json",
    )
    if result.session_id:
        OrgModel = models_pool["organization"]
        org = db.query(OrgModel).get(resolved_org_id)
        max_age = 60 * 60 * 24
        if org and org.access_token_expire_minutes:
            max_age = int(org.access_token_expire_minutes * 60)
        _set_session_cookie(response, result.session_id, max_age)

    return response


@router.post("/login/organizations", response_model=LoginOrganizationsResponse)
def get_login_organizations(
    username: str = Form(...),
    db: Session = Depends(get_db),
) -> LoginOrganizationsResponse:
    """
    Return the list of organizations a user belongs to, for display in the
    org-selector step of the login flow. Accepts either username or email
    (exact match on either field).

    Always returns HTTP 200: an unknown identifier yields an empty organizations
    list rather than a 404, to prevent user existence enumeration via status codes.
    """
    user = (
        db.query(UserModel)
        .filter(
            or_(UserModel.username == username, UserModel.email == username),
            UserModel.active == True,  # noqa: E712
        )
        .first()
    )

    if user is None:
        return LoginOrganizationsResponse(
            organizations=[],
            last_used_organization_id=None,
        )

    organizations = [
        LoginOrganizationItem(id=org.id, name=org.name)
        for org in (user.organizations or [])
    ]

    prefs = UserPreferences.model_validate(user.preferences or {})
    last_used = prefs.last_used_organization_id

    return LoginOrganizationsResponse(
        organizations=organizations,
        last_used_organization_id=last_used,
    )


@router.post("/logout")
def logout(request: Request):
    session_id = request.cookies.get(SESSION_COOKIE_NAME)
    session_store = _get_session_store(request)

    if session_id and session_store:
        session_store.delete(session_id)

    response = Response(
        content='{"success": true}',
        media_type="application/json",
    )
    _clear_session_cookie(response)
    return response


@router.post("/signup", response_model=SignupResponse)
def signup(user_data: UserSignupSubmission, db: Session = Depends(get_db)):
    result = auth_service.signup(
        db,
        user_data.email,
        user_data.password,
        user_data.organization_id,
        invitation_token=user_data.token,
    )
    return {"success": result.success, "id": result.user_id}


@router.post("/init", response_model=InitAnonymousUserResponse)
def create_anonymous_user(init_data: UserInitSubmission, db: Session = Depends(get_db)):
    extra = init_data.model_dump(exclude={"anonymous_id", "organization_id"})
    result = auth_service.init_anonymous_user(
        db, init_data.anonymous_id, init_data.organization_id, **extra
    )
    return {"token": result.token, "user": result.user}


@router.post("/reset-password-request")
async def reset_password_request(
    input: ResetPasswordRequestSubmission, db: Session = Depends(get_db)
):
    ok = await auth_service.request_password_reset(
        db, input.organization_id, input.mixin_id
    )
    return {"success": ok}


@router.post("/reset-password", response_model=ResetPasswordResponse)
def reset_password(input: ResetPasswordSubmission, db: Session = Depends(get_db)):
    result = auth_service.reset_password(
        db,
        input.token,
        input.new_password,
        crosscheck_otp=input.crosscheck_otp,
        should_confirm_2fa=input.should_confirm_2fa_when_change_password,
    )
    return {
        "success": result.success,
        "recovery_codes": result.recovery_codes,
    }


@router.post("/change-password")
def change_password(
    input: ChangePasswordSubmission,
    user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    auth_service.change_password(db, user, input.old_password, input.new_password)
    return {"success": True}


@router.post("/check-2fa-config")
def check_2fa_config(
    token: Annotated[str, Body(embed=True)], db: Session = Depends(get_db)
) -> Info2FaDto:
    result = auth_service.check_2fa_config(db, token)
    return Info2FaDto(
        is_organization_require_2fa=result.is_org_require_2fa,
        is_already_config_2fa=result.is_already_configured,
        totp_uri=result.totp_uri,
    )


# --- SAML ---


@router.get("/login/saml")
async def login_saml(
    request: Request,
    organization_id: int = DEFAULT_ORG_ID,
    db: Session = Depends(get_db),
    redirect: str = None,
):
    sso_url = await saml_service.initiate_login(request, db, organization_id, redirect)
    return RedirectResponse(sso_url)


@router.post("/auth/saml")
async def auth_saml(request: Request, db: Session = Depends(get_db)):
    result = await saml_service.handle_assertion(request, db)

    redirect_path = "/admin/saml-authenticated"
    if result.relay_state:
        redirect_path += f"?redirect={quote(result.relay_state, safe='')}"

    # Create session and set cookie on redirect
    session_store = _get_session_store(request)
    if session_store:
        auth_service.session_store = session_store
        session_id = auth_service.create_session(
            result.user,
            organization_id=result.organization.id,
            db=db,
            ip=request.client.host if request.client else "",
            user_agent=request.headers.get("user-agent", ""),
        )
        if session_id:
            response = RedirectResponse(f"{PUBLIC_URL}{redirect_path}")
            max_age = 60 * 60 * 24
            if result.organization and result.organization.access_token_expire_minutes:
                max_age = int(result.organization.access_token_expire_minutes * 60)
            _set_session_cookie(response, session_id, max_age)
            return response

    # Fallback: pass token in URL
    separator = "&" if "?" in redirect_path else "?"
    return RedirectResponse(
        f"{PUBLIC_URL}{redirect_path}{separator}access_token={result.access_token}"
    )


@router.get("/saml/metadata")
async def saml_metadata(db: Session = Depends(get_db)):
    metadata = saml_service.get_metadata(db)
    return Response(
        content=metadata,
        media_type="application/xml",
        headers={"Content-Disposition": "attachment; filename=metadata.xml"},
    )
