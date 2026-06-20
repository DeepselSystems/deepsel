from typing import Any, Optional
from pydantic import BaseModel
from fastapi import Depends, HTTPException, Body, Path, Request, status
from sqlalchemy.orm import Session
from deepsel.apps.cms.routers.form_content import FormContentSchemaRead
from deepsel.apps.cms.schemas.form_submission import FormSubmissionPublicRead
from deepsel.apps.cms.utils.form_submission import get_lasted_user_submission
from deepsel.utils.crud_router import CRUDRouter
from deepsel.utils.generate_crud_schemas import generate_CRUD_schemas
from deepsel.utils.models_pool import models_pool
from deepsel.deps import get_current_user, get_current_user_optional, get_db
import logging

logger = logging.getLogger(__name__)
UserModel = models_pool["user"]
OrganizationModel = models_pool["organization"]

table_name = "form"
CRUDSchemas = generate_CRUD_schemas(table_name)


class FormSchemaRead(CRUDSchemas.Read):
    contents: list[FormContentSchemaRead] = []


router = CRUDRouter(
    read_schema=FormSchemaRead,
    search_schema=CRUDSchemas.Search,
    create_schema=CRUDSchemas.Create,
    update_schema=CRUDSchemas.Update,
    table_name=table_name,
    bulk_delete_route=True,
    export_route=False,
    import_route=False,
)


class TranslationRequest(BaseModel):
    """Request schema for translating form content"""

    content: dict[str, Any]
    sourceLocale: str
    targetLocale: str


class FormPublicReadSchema(BaseModel):
    """Schema for public form reading (without sensitive data)"""

    id: int
    published: bool
    form_custom_code: str = None
    contents: list[dict[str, Any]]


# Field types that produce meaningful aggregate statistics and contain no PII.
# Text-like types (short_answer, paragraph, date, time, files) are excluded
# because their values are user-entered data that can identify individuals.
#
# IMPORTANT — keep in sync with `renderFieldStats()` in cms-react.
# Whenever you add a new field type to that switch, add its string value
# here as well, and vice-versa.
_STATISTICS_SAFE_FIELD_TYPES = {"checkboxes", "multiple_choice", "dropdown", "number"}


def _strip_pii_from_submission(submission: dict) -> dict:
    """Return submission with submission_data filtered to non-PII field types only."""
    safe_data = {
        field_id: entry
        for field_id, entry in submission.get("submission_data", {}).items()
        if isinstance(entry, dict)
        and entry.get("field_snap_short", {}).get("field_type")
        in _STATISTICS_SAFE_FIELD_TYPES
    }
    return {**submission, "submission_data": safe_data}


@router.post("/translate")
async def translate_form_content(
    request: TranslationRequest = Body(...),
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Translate form content from source locale to target locale"""
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # Get organization settings for translation API
    org_id = user.organization_id
    org_settings = db.query(OrganizationModel).get(org_id)

    if not org_settings or not org_settings.encrypted_data:
        raise HTTPException(
            status_code=400, detail="Translation service not configured"
        )

    # TODO: Implement translation logic similar to other routers
    # This would use the organization's translation API settings
    # to translate form content from source to target locale

    return {"message": "Translation completed", "translated_content": request.content}


@router.get("/public/{form_id}", response_model=FormPublicReadSchema)
async def get_public_form(
    form_id: int = Path(..., description="Form ID"),
    request: Request = None,
    db: Session = Depends(get_db),
):
    """
    Get a public form by ID for rendering on the website.
    This endpoint is accessible without authentication for public form viewing.
    """
    FormModel = models_pool["form"]

    # Create a public user context for access control
    UserModel = models_pool["user"]

    public_user = UserModel()  # This creates a public user instance

    try:
        form = FormModel.get_one(db=db, user=public_user, item_id=form_id)

        # Filter only published content for public access
        published_contents = [
            content
            for content in form.contents
            if hasattr(content, "published") and getattr(content, "published", True)
        ]

        return FormPublicReadSchema(
            id=form.id,
            published=form.published,
            form_custom_code=form.form_custom_code,
            contents=[
                {
                    "id": content.id,
                    "title": content.title,
                    "slug": content.slug,
                    "description": content.description,
                    "closing_remarks": content.closing_remarks,
                    "success_message": content.success_message,
                    "custom_code": content.custom_code,
                    "locale_id": content.locale_id,
                    "max_submissions": content.max_submissions,
                    "show_remaining_submissions": content.show_remaining_submissions,
                    "submissions_count": content.submissions_count,
                    "fields": [
                        {
                            "id": field.id,
                            "field_type": (
                                field.field_type.value
                                if hasattr(field.field_type, "value")
                                else field.field_type
                            ),
                            "label": field.label,
                            "description": field.description,
                            "required": field.required,
                            "placeholder": field.placeholder,
                            "sort_order": field.sort_order,
                            "field_config": field.field_config,
                        }
                        for field in sorted(content.fields, key=lambda f: f.sort_order)
                    ],
                }
                for content in published_contents
            ],
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching public form {form_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error",
        )


@router.get("/website/{lang}/{slug}")
def get_form_by_slug(
    lang: str = Path(..., description="Language code (e.g., 'en', 'vi')"),
    slug: str = Path(..., description="Form slug"),
    db: Session = Depends(get_db),
    user: Optional[UserModel] = Depends(get_current_user_optional),
):
    """
    Get a form by slug and language for public rendering.
    Used for rendering forms at: {site domain}/{lang}/forms/{form slug}
    """
    return _get_form_content_by_slug(lang, slug, db, user)


@router.get("/website/{lang}/{slug}/statistics")
def get_form_statistics_by_slug(
    lang: str = Path(..., description="Language code"),
    slug: str = Path(..., description="Form slug"),
    db: Session = Depends(get_db),
    user: Optional[UserModel] = Depends(get_current_user_optional),
):
    form_content = _get_form_content_by_slug(lang, slug, db, user)

    if not form_content.get("enable_public_statistics"):
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Form statistics is not published",
            )
        user_roles = user.get_user_roles()
        has_permission = any(
            role.string_id in ["admin_role", "super_admin_role", "website_admin_role"]
            for role in user_roles
        )
        if not has_permission:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Form statistics is not published",
            )

    FormSubmissionModel = models_pool["form_submission"]
    form_submissions = (
        db.query(FormSubmissionModel)
        .filter(FormSubmissionModel.form_content_id == form_content.get("id"))
        .all()
    )

    safe_submissions = [
        FormSubmissionPublicRead.model_validate(s).model_dump()
        for s in form_submissions
    ]

    # Anonymous public access: strip PII-containing field types from submission_data.
    # Only option/number fields are needed for aggregate charts; text/file fields
    # contain user-entered data that should not be exposed to unauthenticated requests.
    if user is None:
        safe_submissions = [_strip_pii_from_submission(s) for s in safe_submissions]

    return {**form_content, "submissions": safe_submissions}


def _get_form_content_by_slug(
    lang: str, slug: str, db: Session, user: Optional[UserModel]
):
    """
    Fetch form content by language and slug for public rendering.
    Normalises the slug to always have a leading '/'.
    """
    FormContentModel = models_pool["form_content"]
    LocaleModel = models_pool["locale"]

    try:
        locale = db.query(LocaleModel).filter(LocaleModel.iso_code == lang).first()
        if not locale:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Language '{lang}' is not supported",
            )

        normalized_slug = "/" + slug.lstrip("/")
        # Intentional: slug uniqueness is enforced globally across the platform,
        # so (slug, locale_id) is sufficient to identify a form without org filtering.
        form_content = (
            db.query(FormContentModel)
            .filter(
                FormContentModel.slug == normalized_slug,
                FormContentModel.locale_id == locale.id,
            )
            .first()
        )

        if not form_content:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Form with slug '{normalized_slug}' not found in language '{lang}'",
            )

        if not form_content.form.published:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Form is not published",
            )

        organization_id = form_content.form.organization_id
        public_settings = OrganizationModel.get_public_settings(
            organization_id=organization_id,
            db=db,
            lang=lang,
        )

        return {
            "id": form_content.id,
            "form_id": form_content.form_id,
            "title": form_content.title,
            "slug": form_content.slug,
            "description": form_content.description,
            "closing_remarks": form_content.closing_remarks,
            "success_message": form_content.success_message,
            "custom_code": form_content.custom_code,
            "form_custom_code": form_content.form.form_custom_code,
            "locale_id": form_content.locale_id,
            "max_submissions": form_content.max_submissions,
            "show_remaining_submissions": form_content.show_remaining_submissions,
            "submissions_count": form_content.submissions_count,
            "views_count": form_content.views_count,
            "enable_public_statistics": form_content.enable_public_statistics,
            "latest_user_submission": get_lasted_user_submission(
                db=db, user=user, form_content_id=form_content.id
            ),
            "fields": [
                {
                    "id": field.id,
                    "field_type": (
                        field.field_type.value
                        if hasattr(field.field_type, "value")
                        else field.field_type
                    ),
                    "label": field.label,
                    "description": field.description,
                    "required": field.required,
                    "placeholder": field.placeholder,
                    "sort_order": field.sort_order,
                    "field_config": field.field_config,
                }
                for field in sorted(form_content.fields, key=lambda f: f.sort_order)
            ],
            "public_settings": public_settings,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching form slug='{slug}' lang='{lang}': {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error",
        )
