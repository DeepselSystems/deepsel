from typing import Optional
import logging
from fastapi import Depends, HTTPException, status, Request, APIRouter
from sqlalchemy.orm import Session
from deepsel.deps import get_db, Base
from deepsel.auth.get_current_user import get_current_user
from deepsel.utils.models_pool import models_pool
from deepsel.utils.check_delete_cascade import (
    get_delete_cascade_records_recursively,
)
from deepsel.apps.core.schemas.util import DeleteCheckResponse
from deepsel.apps.core.utils.domain_detection import detect_domain_from_request
from settings import API_PREFIX

logger = logging.getLogger(__name__)

router = APIRouter(prefix=f"{API_PREFIX}/util", tags=["Utilities"])
OrganizationModel = models_pool["organization"]
UserModel = models_pool["user"]


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

    # Model.id is an Integer column on every model that uses this route (no
    # non-integer PK case exists in models_pool) — Postgres/psycopg refuses to
    # implicitly compare integer = varchar, so the raw path-param strings must
    # be cast before filtering, unlike bulk_delete's SearchQuery body where the
    # client already sends a JSON number.
    ids = [int(i) for i in ids.split(",")]

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

    # OrganizationModel is models_pool["organization"] — the most-derived
    # subclass (cms → saml) when those apps are installed — so this picks up
    # their `domains` column without importing anything from them.
    org_settings = OrganizationModel.find_organization_by_domain(domain, db)
    if not org_settings:
        logger.error("No organizations found in database!")
        raise HTTPException(status_code=404, detail="No organizations configured")

    # Dispatch through the pooled organization model so extension apps' overrides
    # apply (e.g. the saml app adds is_enabled_saml/saml_sp_entity_id via its
    # _get_public_settings_fields). OrganizationModel here is models_pool["organization"],
    # which is the most-derived subclass (cms → saml) and inherits CMS's lang-aware impl.
    return OrganizationModel.get_public_settings(org_settings.id, db, lang=lang)


# Keep existing route for backward compatibility
@router.get("/public_settings/{organization_id}")
def get_public_settings(
    organization_id: int,
    lang: Optional[str] = None,
    db: Session = Depends(get_db),
):
    return OrganizationModel.get_public_settings(organization_id, db, lang=lang)
