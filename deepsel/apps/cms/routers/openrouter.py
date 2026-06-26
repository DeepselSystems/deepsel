"""OpenRouter OAuth endpoints — connect/disconnect OpenRouter account."""

import logging

from fastapi import Body, Depends, HTTPException, status, APIRouter
from sqlalchemy.orm import Session
from typing_extensions import Annotated
from deepsel.deps import get_db, settings
from deepsel.auth.get_current_user import get_current_user
from deepsel.utils.models_pool import models_pool
from deepsel.auth.openrouter_oauth import OpenRouterOAuthService

logger = logging.getLogger(__name__)

router = APIRouter(prefix=f"{settings.API_PREFIX}/openrouter", tags=["OpenRouter"])
openrouter_service = OpenRouterOAuthService()


@router.post("/exchange-code")
async def exchange_openrouter_code(
    code: Annotated[str, Body(embed=True)],
    organization_id: Annotated[int, Body(embed=True)],
    code_verifier: Annotated[str | None, Body(embed=True)] = None,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Exchange an OpenRouter auth code for an API key and store it."""
    current_user.check_and_raise_if_not_admin_or_super_admin()

    CMSSettingsModel = models_pool.get("organization")
    org = db.query(CMSSettingsModel).get(organization_id)
    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found",
        )

    try:
        key = await openrouter_service.exchange_code(code, code_verifier=code_verifier)
    except Exception as exc:
        logger.error("OpenRouter code exchange failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to exchange code: {exc}",
        )

    org.openrouter_api_key = key  # setter encrypts
    db.commit()

    return {"success": True}


@router.post("/disconnect")
def disconnect_openrouter(
    organization_id: Annotated[int, Body(embed=True)],
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove the stored OpenRouter API key for an organization."""
    current_user.check_and_raise_if_not_admin_or_super_admin()

    CMSSettingsModel = models_pool.get("organization")
    org = db.query(CMSSettingsModel).get(organization_id)
    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found",
        )

    org.openrouter_api_key = None
    db.commit()

    return {"success": True}
