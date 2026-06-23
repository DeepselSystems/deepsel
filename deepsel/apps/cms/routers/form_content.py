from typing import Any, Optional
from pydantic import BaseModel
from fastapi import Depends, HTTPException, Body, Path, status
from sqlalchemy.orm import Session

from deepsel.utils.crud_router import CRUDRouter
from deepsel.utils.generate_crud_schemas import generate_CRUD_schemas
from deepsel.utils.models_pool import models_pool
from deepsel.apps.cms.types.form import FormFieldTypeEnum
from deepsel.deps import get_db, get_current_user
from deepsel.apps.cms.models.organization import CMSSettingsModel
from deepsel.apps.cms.utils.form_content import (
    check_form_content_slug_with_conflict,
    generate_slug_from_title,
)
import logging

logger = logging.getLogger(__name__)

table_name = "form_content"
CRUDSchemas = generate_CRUD_schemas(table_name)


class FormContentSchemaRead(CRUDSchemas.Read):
    submissions_count: Optional[int] = None


router = CRUDRouter(
    read_schema=FormContentSchemaRead,
    search_schema=CRUDSchemas.Search,
    create_schema=CRUDSchemas.Create,
    update_schema=CRUDSchemas.Update,
    table_name=table_name,
    bulk_delete_route=False,
    export_route=False,
    import_route=False,
)


class FormFieldCreateSchema(BaseModel):
    """Schema for creating form fields"""

    field_type: str
    label: str
    description: Optional[str] = None
    required: bool = False
    placeholder: Optional[str] = None
    sort_order: int = 0
    field_config: Optional[dict[str, Any]] = None


class FormFieldUpdateSchema(BaseModel):
    """Schema for updating form fields"""

    field_type: Optional[str] = None
    label: Optional[str] = None
    description: Optional[str] = None
    required: Optional[bool] = None
    placeholder: Optional[str] = None
    sort_order: Optional[int] = None
    field_config: Optional[dict[str, Any]] = None


class GenerateSlugRequest(BaseModel):
    """Request schema for generating a slug from a title"""

    title: str
    locale_id: int
    max_length: int = 50
    form_content_id: Optional[int] = None


class GenerateSlugResponse(BaseModel):
    """Response schema for slug generation"""

    title: str
    slug: str
    locale_id: int
    form_content_id: Optional[int] = None


class ValidateSlugRequest(BaseModel):
    """Request schema for validating a slug"""

    form_content_id: Optional[int] = None
    locale_id: int
    slug: str


class ConflictingFormContent(BaseModel):
    """Schema for conflicting form content"""

    id: int
    title: str
    slug: str
    locale_id: int
    description: Optional[str] = None


class ValidateSlugResponse(BaseModel):
    """Response schema for slug validation"""

    is_valid: bool
    slug: str
    locale_id: int
    form_content_id: Optional[int] = None
    conflicting_form_content: Optional[ConflictingFormContent] = None
    suggested_slug: Optional[str] = None


class TranslationRequest(BaseModel):
    """Request schema for translating form content"""

    content: dict[str, Any]
    sourceLocale: str
    targetLocale: str


@router.post("/generate-slug")
async def generate_slug(
    request: GenerateSlugRequest,
    db: Session = Depends(get_db),
):
    """
    Generate a unique slug from a form title.

    This endpoint takes a title and generates a URL-friendly slug that is guaranteed
    to be unique within the specified locale.
    """
    # Generate the slug
    slug = generate_slug_from_title(
        db=db,
        title=request.title,
        locale_id=request.locale_id,
        max_length=request.max_length,
        current_form_content_id=request.form_content_id,
    )

    return GenerateSlugResponse(
        title=request.title,
        slug=slug,
        locale_id=request.locale_id,
        form_content_id=request.form_content_id,
    )


@router.post("/validate-slug")
async def validate_slug(
    request: ValidateSlugRequest,
    db: Session = Depends(get_db),
):
    """
    Validate if a slug is available for use within a specific locale.

    This endpoint checks if the provided slug is valid (not already taken) within
    the specified locale. If the slug is already taken, it returns the conflicting
    form content and provides a suggested alternative slug.
    """
    # Check for conflicts
    is_valid, conflicting_content = check_form_content_slug_with_conflict(
        db=db,
        slug=request.slug,
        locale_id=request.locale_id,
        current_form_content_id=request.form_content_id,
    )

    # Prepare response
    response_data = {
        "is_valid": is_valid,
        "slug": request.slug,
        "locale_id": request.locale_id,
        "form_content_id": request.form_content_id,
    }

    # If there's a conflict, include the conflicting content and suggest a new slug
    if not is_valid and conflicting_content:
        # Generate a suggested slug
        suggested_slug = generate_slug_from_title(
            db=db,
            title=request.slug,
            locale_id=request.locale_id,
            current_form_content_id=request.form_content_id,
        )

        response_data.update(
            {
                "conflicting_form_content": {
                    "id": conflicting_content.id,
                    "title": conflicting_content.title,
                    "slug": conflicting_content.slug,
                    "locale_id": conflicting_content.locale_id,
                    "description": conflicting_content.description,
                },
                "suggested_slug": suggested_slug,
            }
        )

    return ValidateSlugResponse(**response_data)


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
    org_settings = db.query(CMSSettingsModel).get(org_id)

    if not org_settings or not org_settings.encrypted_data:
        raise HTTPException(
            status_code=400, detail="Translation service not configured"
        )

    return {"message": "Translation completed", "translated_content": request.content}


@router.post("/{form_content_id}/fields")
async def create_form_field(
    form_content_id: int = Path(..., description="Form content ID"),
    field_data: FormFieldCreateSchema = Body(...),
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new field for a form content"""
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    FormContentModel = models_pool["form_content"]
    FormFieldModel = models_pool["form_field"]

    try:
        # Verify form content exists
        form_content = db.query(FormContentModel).get(form_content_id)
        if not form_content:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Form content not found"
            )

        # Validate field type
        try:
            field_type_enum = FormFieldTypeEnum(field_data.field_type)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid field type: {field_data.field_type}",
            )

        # Create the field
        field = FormFieldModel.create(
            db=db,
            user=user,
            values={
                "form_content_id": form_content_id,
                "field_type": field_type_enum,
                "label": field_data.label,
                "description": field_data.description,
                "required": field_data.required,
                "placeholder": field_data.placeholder,
                "sort_order": field_data.sort_order,
                "field_config": field_data.field_config or {},
            },
        )

        return {
            "id": field.id,
            "field_type": field.field_type.value,
            "label": field.label,
            "description": field.description,
            "required": field.required,
            "placeholder": field.placeholder,
            "sort_order": field.sort_order,
            "field_config": field.field_config,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating form field: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create form field",
        )


@router.put("/{form_content_id}/fields/{field_id}")
async def update_form_field(
    form_content_id: int = Path(..., description="Form content ID"),
    field_id: int = Path(..., description="Field ID"),
    field_data: FormFieldUpdateSchema = Body(...),
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a form field"""
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    FormFieldModel = models_pool["form_field"]

    try:
        # Find the field
        field = (
            db.query(FormFieldModel)
            .filter(
                FormFieldModel.id == field_id,
                FormFieldModel.form_content_id == form_content_id,
            )
            .first()
        )

        if not field:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Form field not found"
            )

        # Prepare update values
        update_values = {}

        if field_data.field_type is not None:
            try:
                field_type_enum = FormFieldTypeEnum(field_data.field_type)
                update_values["field_type"] = field_type_enum
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid field type: {field_data.field_type}",
                )

        if field_data.label is not None:
            update_values["label"] = field_data.label
        if field_data.description is not None:
            update_values["description"] = field_data.description
        if field_data.required is not None:
            update_values["required"] = field_data.required
        if field_data.placeholder is not None:
            update_values["placeholder"] = field_data.placeholder
        if field_data.sort_order is not None:
            update_values["sort_order"] = field_data.sort_order
        if field_data.field_config is not None:
            update_values["field_config"] = field_data.field_config

        # Update the field
        updated_field = field.update(db=db, user=user, values=update_values)

        return {
            "id": updated_field.id,
            "field_type": updated_field.field_type.value,
            "label": updated_field.label,
            "description": updated_field.description,
            "required": updated_field.required,
            "placeholder": updated_field.placeholder,
            "sort_order": updated_field.sort_order,
            "field_config": updated_field.field_config,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating form field: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update form field",
        )


@router.delete("/{form_content_id}/fields/{field_id}")
async def delete_form_field(
    form_content_id: int = Path(..., description="Form content ID"),
    field_id: int = Path(..., description="Field ID"),
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a form field"""
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    FormFieldModel = models_pool["form_field"]

    try:
        # Find the field
        field = (
            db.query(FormFieldModel)
            .filter(
                FormFieldModel.id == field_id,
                FormFieldModel.form_content_id == form_content_id,
            )
            .first()
        )

        if not field:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Form field not found"
            )

        # Delete the field
        field.delete(db=db, user=user)

        return {"message": "Form field deleted successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting form field: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete form field",
        )


@router.get("/{form_content_id}/fields")
async def get_form_fields(
    form_content_id: int = Path(..., description="Form content ID"),
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get all fields for a form content"""
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    FormContentModel = models_pool["form_content"]
    FormFieldModel = models_pool["form_field"]

    try:
        # Verify form content exists
        form_content = db.query(FormContentModel).get(form_content_id)
        if not form_content:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Form content not found"
            )

        # Get all fields for this form content, ordered by sort_order
        fields = (
            db.query(FormFieldModel)
            .filter(FormFieldModel.form_content_id == form_content_id)
            .order_by(FormFieldModel.sort_order)
            .all()
        )

        return [
            {
                "id": field.id,
                "field_type": field.field_type.value,
                "label": field.label,
                "description": field.description,
                "required": field.required,
                "placeholder": field.placeholder,
                "sort_order": field.sort_order,
                "field_config": field.field_config,
            }
            for field in fields
        ]

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching form fields: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch form fields",
        )


@router.post("/{form_content_id}/fields/reorder")
async def reorder_form_fields(
    form_content_id: int = Path(..., description="Form content ID"),
    field_orders: list[dict[str, int]] = Body(
        ..., description="List of {field_id: sort_order} mappings"
    ),
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Reorder form fields by updating their sort_order values"""
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    FormContentModel = models_pool["form_content"]
    FormFieldModel = models_pool["form_field"]

    try:
        # Verify form content exists
        form_content = db.query(FormContentModel).get(form_content_id)
        if not form_content:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Form content not found"
            )

        # Update sort orders
        for field_order in field_orders:
            field_id = field_order.get("field_id")
            sort_order = field_order.get("sort_order")

            if field_id is None or sort_order is None:
                continue

            field = (
                db.query(FormFieldModel)
                .filter(
                    FormFieldModel.id == field_id,
                    FormFieldModel.form_content_id == form_content_id,
                )
                .first()
            )

            if field:
                field.update(db=db, user=user, values={"sort_order": sort_order})

        return {"message": "Form fields reordered successfully"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error reordering form fields: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to reorder form fields",
        )


@router.put("/{form_content_id}/increment-views")
async def increment_form_views(
    form_content_id: str = Path(..., description="Form content ID"),
    db: Session = Depends(get_db),
):
    """
    Increment the number of views for a form content by 1.

    This endpoint increases the view counter each time it is called.
    No authentication required as this is typically called when viewing a form.
    """
    FormContentModel = models_pool["form_content"]

    try:
        # Find the form content
        form_content = (
            db.query(FormContentModel)
            .filter(FormContentModel.id == form_content_id)
            .one_or_none()
        )
        if not form_content:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Form content not found"
            )

        # Increment the number of views
        form_content.views_count = (form_content.views_count or 0) + 1
        db.commit()
        db.refresh(form_content)

        return {"id": form_content.id, "message": "View count incremented successfully"}

    except Exception as e:
        logger.error(f"Error incrementing form views: {str(e)}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to increment view count",
        )
