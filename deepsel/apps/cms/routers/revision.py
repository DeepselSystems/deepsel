import logging
from typing import Optional
from fastapi import Depends, HTTPException, APIRouter
from pydantic import BaseModel
from sqlalchemy.orm import Session
from deepsel.deps import get_db, get_current_user, settings
from deepsel.utils.models_pool import models_pool
from deepsel.orm import PermissionAction
from ..utils.edit_session_manager import edit_session_manager
from .draft import _field_list

logger = logging.getLogger(__name__)

router = APIRouter(prefix=f"{settings.API_PREFIX}/revision", tags=["Content Revision"])
UserModel = models_pool["user"]


class RestoreRequest(BaseModel):
    content_type: str  # "page_content" or "blog_post_content"
    content_id: int
    revision_id: int


@router.post("/restore")
async def restore_content_revision(
    restore_request: RestoreRequest,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
):

    content_type = restore_request.content_type
    content_id = restore_request.content_id
    revision_id = restore_request.revision_id

    # Get the appropriate models
    if content_type == "page_content":
        ContentModel = models_pool["page_content"]
        RevisionModel = models_pool["page_content_revision"]
        content_field = "page_content_id"
        record_type = "page"
        parent_id_attr = "page_id"
    elif content_type == "blog_post_content":
        ContentModel = models_pool["blog_post_content"]
        RevisionModel = models_pool["blog_post_content_revision"]
        content_field = "blog_post_content_id"
        record_type = "blog_post"
        parent_id_attr = "post_id"
    else:
        raise HTTPException(status_code=400, detail="Invalid content_type")

    # Get the content record
    content = db.query(ContentModel).filter(ContentModel.id == content_id).first()
    if not content:
        raise HTTPException(status_code=404, detail="Content not found")

    # Check permissions
    [allowed, _] = content._check_has_permission(PermissionAction.write, user)
    if not allowed:
        raise HTTPException(status_code=403, detail="Permission denied")

    # Get the revision
    revision = (
        db.query(RevisionModel)
        .filter(
            RevisionModel.id == revision_id,
            getattr(RevisionModel, content_field) == content_id,
        )
        .first()
    )
    if not revision:
        raise HTTPException(status_code=404, detail="Revision not found")

    # Snapshot the current live content before overwriting it
    old_content_text = content.content

    # Restore live content and clear all draft fields, mirroring /draft/revert so that
    # a later publish cannot apply stale draft title/SEO/custom-code over the restored body.
    content.content = revision.new_content
    for field in _field_list(record_type):
        draft_attr = f"draft_{field}"
        if hasattr(content, draft_attr):
            setattr(content, draft_attr, None)
    content.has_draft = False
    content.draft_last_modified_at = None
    content.draft_updated_by_id = None

    # Count before adding the new revision row (still in the same transaction).
    revision_count = (
        db.query(RevisionModel)
        .filter(getattr(RevisionModel, content_field) == content_id)
        .count()
    )

    # Create the audit revision in the same transaction as the content update so that
    # a failure in either step rolls back both — no orphaned restore without a record.
    RevisionModel.create(
        db,
        user,
        {
            content_field: content_id,
            "old_content": old_content_text,
            "new_content": revision.new_content,
            "name": f"Restored from revision #{revision.revision_number} by {user.email or user.username or 'system'}",
            "revision_number": revision_count + 1,
        },
    )

    db.commit()
    db.refresh(content)

    # Notify other editors so they reload the record and see the restored content.
    record_id = getattr(content, parent_id_attr)
    await edit_session_manager.broadcast_to_editors(
        record_type,
        record_id,
        {
            "type": "published",
            "origin_user_id": user.id,
            "record_type": record_type,
            "record_id": record_id,
        },
        exclude_user_id=user.id,
    )

    return {"message": "Content restored successfully"}


class NameRevisionRequest(BaseModel):
    content_type: str  # "page_content" or "blog_post_content"
    revision_id: int
    name: Optional[str] = None  # None = clear the name


@router.post("/name")
async def name_content_revision(
    name_request: NameRevisionRequest,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
):
    content_type = name_request.content_type
    revision_id = name_request.revision_id
    name = name_request.name

    if content_type == "page_content":
        RevisionModel = models_pool["page_content_revision"]
        ContentModel = models_pool["page_content"]
        content_field = "page_content_id"
    elif content_type == "blog_post_content":
        RevisionModel = models_pool["blog_post_content_revision"]
        ContentModel = models_pool["blog_post_content"]
        content_field = "blog_post_content_id"
    else:
        raise HTTPException(status_code=400, detail="Invalid content_type")

    revision = db.query(RevisionModel).filter(RevisionModel.id == revision_id).first()
    if not revision:
        raise HTTPException(status_code=404, detail="Revision not found")

    content_id = getattr(revision, content_field)
    content = db.query(ContentModel).filter(ContentModel.id == content_id).first()
    if not content:
        raise HTTPException(status_code=404, detail="Content not found")

    [allowed, _] = content._check_has_permission(PermissionAction.write, user)
    if not allowed:
        raise HTTPException(status_code=403, detail="Permission denied")

    revision.name = name
    db.commit()

    return {"message": "Revision name updated successfully"}
