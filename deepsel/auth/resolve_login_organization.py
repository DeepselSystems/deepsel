from sqlalchemy import or_
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from deepsel.auth.types import UserPreferences


def resolve_login_organization_id(db: Session, identifier: str, user_model) -> int:
    """
    Determine the most appropriate organization ID for a login attempt
    when no organization_id was explicitly supplied.

    Resolution order:
    1. last_used_organization_id stored in user.preferences — if still a valid membership
    2. First organization in user.organizations

    Raises HTTPException 401 if user is not found (let auth error surface naturally).
    Raises HTTPException 403 if user has no organizations at all.
    """
    user = (
        db.query(user_model)
        .filter(or_(user_model.email == identifier, user_model.username == identifier))
        .filter(user_model.active == True)  # noqa: E712
        .first()
    )

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )

    user_org_ids = {org.id for org in (user.organizations or [])}

    if not user_org_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User does not belong to any organization",
        )

    prefs = UserPreferences.model_validate(getattr(user, "preferences", None) or {})
    last_used = prefs.last_used_organization_id
    if last_used is not None and last_used in user_org_ids:
        return last_used

    return next(iter(user.organizations)).id
