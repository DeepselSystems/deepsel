from typing import Any, Optional
from pydantic import BaseModel
from fastapi import (
    Depends,
    BackgroundTasks,
    HTTPException,
    Request,
    status,
)
from starlette.datastructures import UploadFile
from datetime import datetime
import json
import uuid
import re

from sqlalchemy.orm import Session

from deepsel.apps.cms.utils.form_submission import send_form_submission_notification
from deepsel.deps import get_db, get_current_user_optional
from deepsel.utils.attachment import resolve_unique_attachment_name
from deepsel.utils.crud_router import CRUDRouter
from deepsel.utils.generate_crud_schemas import generate_CRUD_schemas
from deepsel.utils.models_pool import models_pool
from settings import UPLOAD_SIZE_LIMIT
import logging

logger = logging.getLogger(__name__)

table_name = "form_submission"
CRUDSchemas = generate_CRUD_schemas(table_name)

AttachmentModel = models_pool["attachment"]
AttachmentLocaleVersionModel = models_pool["attachment_locale_version"]
UserModel = models_pool["user"]

# Pattern for file keys sent by the frontend: file_{fieldId}_{index}
_FILE_KEY_RE = re.compile(r"^file_(\d+)_(\d+)$")


class CreateSchema(CRUDSchemas.Create):
    submission_history: Optional[None] = None


router = CRUDRouter(
    read_schema=CRUDSchemas.Read,
    search_schema=CRUDSchemas.Search,
    create_schema=CreateSchema,
    update_schema=CRUDSchemas.Update,
    table_name=table_name,
    bulk_delete_route=True,
    export_route=False,
    import_route=False,
    update_route=False,
    create_route=False,
)


class FormSubmissionReadSchema(BaseModel):
    """Schema for reading form submissions with additional details"""

    id: int
    form_id: int
    submission_data: dict[str, Any]
    submitter_info: Optional[dict[str, Any]] = None
    submitted_at: datetime
    form_title: Optional[str] = None
    form_content_title: Optional[str] = None


class FormSubmissionStatsSchema(BaseModel):
    """Schema for form submission statistics"""

    total_submissions: int
    submissions_today: int
    submissions_this_week: int
    submissions_this_month: int
    latest_submission: Optional[datetime] = None


@router.post("", response_model=CRUDSchemas.Read)
async def create_form_submission(
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: Optional[UserModel] = Depends(get_current_user_optional),
):
    """
    Create a new form submission (multipart/form-data).

    submission_data and submitter_info are JSON strings.
    When files are present, FE sends fields named file_{fieldId}_{index} —
    these are extracted from raw form data since FastAPI cannot capture
    dynamically-named file fields via typed parameters.
    """
    form = await request.form()

    form_id = int(form["form_id"])
    form_content_id = int(form["form_content_id"])
    submission_data = str(form["submission_data"])
    submitter_user_agent: Optional[str] = form.get("submitter_user_agent")  # type: ignore[assignment]
    submitter_info: Optional[str] = form.get("submitter_info")  # type: ignore[assignment]

    parsed_submission_data = json.loads(submission_data)

    # Extract files by their dynamic field names (file_{fieldId}_{index})
    named_files: dict[str, UploadFile] = {
        key: val  # type: ignore[assignment]
        for key, val in form.multi_items()
        if isinstance(val, UploadFile) and _FILE_KEY_RE.match(key)
    }

    if named_files:
        parsed_submission_data = _process_uploaded_files(
            db=db,
            named_files=named_files,
            submission_data=parsed_submission_data,
            form_content_id=form_content_id,
        )

    payload = {
        "form_id": form_id,
        "form_content_id": form_content_id,
        "submission_data": parsed_submission_data,
        "submitter_user_agent": submitter_user_agent,
        "submitter_info": json.loads(submitter_info) if submitter_info else None,
    }

    FormSubmissionModel = models_pool["form_submission"]
    instance = FormSubmissionModel.create(db, user, payload)

    organization_id = instance.form.organization_id

    background_tasks.add_task(
        send_form_submission_notification,
        db=db,
        form_submission_id=instance.id,
        organization_id=organization_id,
        user=user,
    )

    logger.info(f"Form submission {instance.id} created, notification email queued")

    return instance


def _process_uploaded_files(
    db: Session,
    named_files: dict[str, UploadFile],
    submission_data: dict,
    form_content_id: int,
) -> dict:
    """
    Creates Attachment + AttachmentLocaleVersion records for each uploaded file
    and injects the attachment records into submission_data at the matching field positions.

    named_files keys follow the pattern file_{fieldId}_{index} set by the frontend.
    Attachment creation bypasses permission check since uploads are anonymous —
    organization_id is resolved from the form_content's organization instead.
    """
    FormContentModel = models_pool["form_content"]
    form_content = db.query(FormContentModel).filter_by(id=form_content_id).first()
    if not form_content:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"form_content {form_content_id} not found",
        )

    organization_id = form_content.form.organization_id

    # Use the form content's own locale — matches the language the user submitted in
    locale_id = form_content.locale_id

    # Check storage quota for all incoming files
    total_bytes = 0
    for upload in named_files.values():
        upload.file.seek(0, 2)
        total_bytes += upload.file.tell()
        upload.file.seek(0)
    AttachmentLocaleVersionModel.check_storage_quota(db, total_bytes)

    # Group attachment records by field ID: {field_id: [record, ...]}
    field_attachments: dict[str, list[dict]] = {}

    for field_key, upload in named_files.items():
        match = _FILE_KEY_RE.match(field_key)
        if not match:
            continue

        field_id_str = match.group(1)

        # Validate file size against UPLOAD_SIZE_LIMIT
        upload.file.seek(0, 2)
        file_size = upload.file.tell()
        upload.file.seek(0)

        max_bytes = UPLOAD_SIZE_LIMIT * 1024 * 1024
        if file_size > max_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File {upload.filename} exceeds the {UPLOAD_SIZE_LIMIT}MB limit",
            )

        # Create Attachment record — bypass permission since user may be anonymous
        attachment_name = resolve_unique_attachment_name(
            str(uuid.uuid4()).split("-")[0], db
        )
        attachment = AttachmentModel().create(
            db=db,
            user=None,
            values={
                "name": attachment_name,
                "organization_id": organization_id,
            },
            bypass_permission=True,
        )

        # Create AttachmentLocaleVersion with the actual file
        if locale_id:
            upload.file.seek(0)
            AttachmentLocaleVersionModel().create(
                db=db,
                user=None,
                file=upload,
                attachment_id=attachment.id,
                locale_id=locale_id,
                organization_id=organization_id,
                bypass_permission=True,
            )

        db.refresh(attachment)

        # Build a minimal record shape matching UploadedFileRecord (read by FormSubmissionViewer)
        locale_ver = (attachment.locale_versions or [None])[0]
        record = {
            "id": attachment.id,
            "name": attachment.name,
            "content_type": getattr(locale_ver, "content_type", None),
            "filesize": getattr(locale_ver, "filesize", None),
        }

        if field_id_str not in field_attachments:
            field_attachments[field_id_str] = []
        field_attachments[field_id_str].append(record)

    # Inject attachment records into submission_data at matching field IDs
    for field_id_str, records in field_attachments.items():
        if field_id_str in submission_data:
            submission_data[field_id_str] = {
                **submission_data[field_id_str],
                "value": records,
            }

    return submission_data
