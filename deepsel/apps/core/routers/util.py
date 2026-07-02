from typing import Optional
import logging
from fastapi import Depends, HTTPException, status, Request, APIRouter
from sqlalchemy.orm import Session
from db import get_db, Base
from deepsel.auth.get_current_user import get_current_user
from deepsel.utils.models_pool import models_pool
from deepsel.utils.check_delete_cascade import (
    get_delete_cascade_records_recursively,
)
from deepsel.apps.core.schemas.util import DeleteCheckResponse
from settings import API_PREFIX

logger = logging.getLogger(__name__)

router = APIRouter(prefix=f"{API_PREFIX}/util", tags=["Utilities"])
OrganizationModel = models_pool["organization"]
UserModel = models_pool["user"]

# Import CMS-specific models and utilities for domain detection
try:
    from apps.cms.models.organization import CMSSettingsModel
    from apps.cms.utils.domain_detection import detect_domain_from_request

    HAS_CMS = True
except ImportError:
    HAS_CMS = False

    # Fallback function if CMS is not available
    def detect_domain_from_request(request):
        """Extract host from request headers"""
        host = request.headers.get("host", "")
        return host.split(":")[0] if host else ""


@router.get("/delete_check/{model}/{ids}", response_model=DeleteCheckResponse)
def delete_check(
    model: str,  # table name
    ids: str,  # comma separated list of ids
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
):
    if model == "xray":
        model = "tracking_session"
    elif model == "xray_event":
        model = "tracking_event"

    ids = ids.split(",")

    Model = models_pool.get(model, None)
    if Model is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Model not found"
        )

    records = db.query(Model).filter(Model.id.in_(ids)).all()
    if not records:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Record not found"
        )

    affected_records = get_delete_cascade_records_recursively(
        db, records, declarative_base=Base
    )

    return {
        "to_delete": {
            k: [str(row.record) for row in v]
            for k, v in affected_records.to_delete.items()
        },
        "to_set_null": {
            k: [str(row.record) for row in v]
            for k, v in affected_records.to_set_null.items()
        },
    }


# New route without organization_id - uses domain detection
@router.get("/public_settings")
def get_public_settings_by_domain(
    request: Request,
    lang: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Get public settings for organization detected by domain"""
    # Detect organization by domain using centralized utility
    domain = detect_domain_from_request(request)

    # logger.info(f"/public_settings detect domain: {domain}")
    # Use CMS-specific domain detection if available, otherwise fallback to basic logic
    if HAS_CMS:
        org_settings = CMSSettingsModel.find_organization_by_domain(domain, db)
        # if org_settings:
        #     logger.info(
        #         f"/public_settings found org: {org_settings.id} (name: {org_settings.name}) with domains: {getattr(org_settings, 'domains', [])}"
        #     )
        if not org_settings:
            logger.error("No organizations found via CMS domain detection!")
            raise HTTPException(status_code=404, detail="No organizations configured")
    else:
        # Fallback logic for basic organization detection
        organizations = db.query(OrganizationModel).all()
        org_settings = None

        logger.info(f"Found {len(organizations)} organizations total")

        # First try exact domain match
        for org in organizations:
            logger.info(
                f"Org ID {org.id}: domains={getattr(org, 'domains', None)}, name='{getattr(org, 'name', 'Unknown')}'"
            )
            if hasattr(org, "domains") and org.domains and domain in org.domains:
                logger.info(
                    f"EXACT MATCH: Found organization {org.id} for domain '{domain}'"
                )
                org_settings = org
                break

        # Fallback to wildcard organization
        if not org_settings:
            for org in organizations:
                if hasattr(org, "domains") and org.domains and "*" in org.domains:
                    logger.info(
                        f"WILDCARD MATCH: Using organization {org.id} with wildcard domain"
                    )
                    org_settings = org
                    break

        # Final fallback - get first organization
        if not org_settings:
            org_settings = organizations[0] if organizations else None
            if org_settings:
                logger.info(
                    f"DEFAULT FALLBACK: Using first organization {org_settings.id}"
                )
            else:
                logger.error("No organizations found in database!")
                raise HTTPException(
                    status_code=404, detail="No organizations configured"
                )
    # Use CMS model for public settings if available, as it has extended functionality
    if HAS_CMS:
        return CMSSettingsModel.get_public_settings(org_settings.id, db, lang=lang)
    else:
        return OrganizationModel.get_public_settings(org_settings.id, db, lang=lang)


# Keep existing route for backward compatibility
@router.get("/public_settings/{organization_id}")
def get_public_settings(
    organization_id: int,
    lang: Optional[str] = None,
    db: Session = Depends(get_db),
):
    return OrganizationModel.get_public_settings(organization_id, db, lang=lang)
