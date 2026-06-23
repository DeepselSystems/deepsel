"""Draft save, publish, and unpublish endpoints for blog posts and pages.

Autosave writes to the draft_* columns. Publishing copies draft_* -> live fields,
creates a revision, clears the draft, and marks the parent as published.
"""

from datetime import datetime, timezone
from typing import Any, Literal, Optional
from fastapi import Depends, HTTPException, status, APIRouter
from pydantic import BaseModel
from sqlalchemy.orm import Session
from deepsel.deps import get_db, settings, get_current_user
from deepsel.orm import PermissionAction
from deepsel.utils.models_pool import models_pool
from ..utils.edit_session_manager import edit_session_manager
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix=f"{settings.API_PREFIX}/draft", tags=["Draft"])
UserModel = models_pool["user"]

RecordType = Literal["blog_post", "page"]


# Fields that live in the content record and get a draft_* twin.
# Keeping this list explicit makes the copy logic below trivial and auditable.
_BLOG_POST_FIELDS = [
    "title",
    "subtitle",
    "content",
    "reading_length",
    "featured_image_id",
    "seo_metadata_title",
    "seo_metadata_description",
    "seo_metadata_featured_image_id",
    "seo_metadata_allow_indexing",
    "custom_code",
]

_PAGE_FIELDS = [
    "title",
    "content",
    "seo_metadata_title",
    "seo_metadata_description",
    "seo_metadata_featured_image_id",
    "seo_metadata_allow_indexing",
    "custom_code",
]


def _field_list(record_type: RecordType) -> list[str]:
    return _BLOG_POST_FIELDS if record_type == "blog_post" else _PAGE_FIELDS


def _resolve_models(record_type: RecordType):
    if record_type == "blog_post":
        return (
            models_pool["blog_post"],
            models_pool["blog_post_content"],
            models_pool["blog_post_content_revision"],
            "blog_post_content_id",
        )
    if record_type == "page":
        return (
            models_pool["page"],
            models_pool["page_content"],
            models_pool["page_content_revision"],
            "page_content_id",
        )
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Invalid record_type {record_type!r}",
    )


def _user_display_name(user: UserModel) -> str:
    return (
        getattr(user, "name", None)
        or f"{getattr(user, 'first_name', '') or ''} {getattr(user, 'last_name', '') or ''}".strip()
        or getattr(user, "email", None)
        or getattr(user, "username", None)
        or "system"
    )


def _user_image_name(user: UserModel) -> Optional[str]:
    img = getattr(user, "image", None)
    return getattr(img, "name", None) if img else None


class ContentDraftPayload(BaseModel):
    content_id: int
    title: Optional[str] = None
    subtitle: Optional[str] = None
    content: Optional[str] = None
    reading_length: Optional[str] = None
    featured_image_id: Optional[int] = None
    seo_metadata_title: Optional[str] = None
    seo_metadata_description: Optional[str] = None
    seo_metadata_featured_image_id: Optional[int] = None
    seo_metadata_allow_indexing: Optional[bool] = None
    custom_code: Optional[str] = None


class SaveDraftRequest(BaseModel):
    record_type: RecordType
    record_id: int
    contents: list[ContentDraftPayload]
    # Optional parent-level fields that apply only on publish (we accept them here
    # so the frontend has one source of truth for "what's in the draft") but we
    # just pass them through to publish; save_draft does not mutate the parent.
    parent_fields: Optional[dict[str, Any]] = None


class PublishRequest(BaseModel):
    record_type: RecordType
    record_id: int
    # Optional overrides applied at publish time (e.g. publish_date, slug, author_id).
    # If omitted, the current parent values are used.
    parent_fields: Optional[dict[str, Any]] = None
    # When set, only promote the draft of that one content row (single language).
    # When omitted, promote drafts on every content row (all languages).
    content_id: Optional[int] = None


class UnpublishRequest(BaseModel):
    record_type: RecordType
    record_id: int
    # When set, only unpublish that one content row (single language).
    # When omitted, unpublish every content row (all languages).
    content_id: Optional[int] = None


class RevertRequest(BaseModel):
    record_type: RecordType
    record_id: int
    # When set, only discard the draft of that one content row (single language).
    # When omitted, discard drafts on every content row (all languages).
    content_id: Optional[int] = None


def _serialize_draft(content) -> dict[str, Any]:
    """Shape sent over the WS broadcast so other editors can merge into their form."""
    return {
        "content_id": content.id,
        "has_draft": content.has_draft,
        "draft_title": content.draft_title,
        "draft_subtitle": getattr(content, "draft_subtitle", None),
        "draft_content": content.draft_content,
        "draft_reading_length": getattr(content, "draft_reading_length", None),
        "draft_featured_image_id": getattr(content, "draft_featured_image_id", None),
        "draft_seo_metadata_title": content.draft_seo_metadata_title,
        "draft_seo_metadata_description": content.draft_seo_metadata_description,
        "draft_seo_metadata_featured_image_id": content.draft_seo_metadata_featured_image_id,
        "draft_seo_metadata_allow_indexing": content.draft_seo_metadata_allow_indexing,
        "draft_custom_code": content.draft_custom_code,
        "draft_last_modified_at": (
            content.draft_last_modified_at.isoformat()
            if content.draft_last_modified_at
            else None
        ),
    }


@router.post("/save_draft")
async def save_draft(
    request: SaveDraftRequest,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
):
    """Autosave endpoint — writes to draft_* columns only, never touches live fields."""
    MainModel, ContentModel, _, _ = _resolve_models(request.record_type)

    main = db.query(MainModel).filter(MainModel.id == request.record_id).first()
    if not main:
        raise HTTPException(status_code=404, detail="Record not found")

    [allowed, _scope] = main._check_has_permission(PermissionAction.write, user)
    if not allowed:
        raise HTTPException(status_code=403, detail="Permission denied")

    now = datetime.now(timezone.utc)
    fields = _field_list(request.record_type)
    updated_contents = []

    parent_fk_col = (
        ContentModel.post_id
        if request.record_type == "blog_post"
        else ContentModel.page_id
    )

    for payload in request.contents:
        content = (
            db.query(ContentModel)
            .filter(
                ContentModel.id == payload.content_id,
                parent_fk_col == request.record_id,
            )
            .first()
        )
        if not content:
            continue

        payload_dict = payload.model_dump(exclude_unset=True, exclude={"content_id"})
        for field in fields:
            if field in payload_dict:
                setattr(content, f"draft_{field}", payload_dict[field])

        content.has_draft = True
        content.draft_last_modified_at = now
        content.draft_updated_by_id = user.id
        updated_contents.append(content)

    db.commit()
    for c in updated_contents:
        db.refresh(c)

    broadcast_payload = {
        "type": "draft_saved",
        "origin_user_id": user.id,
        "origin_user": {
            "user_id": user.id,
            "display_name": _user_display_name(user),
            "image_name": _user_image_name(user),
        },
        "record_type": request.record_type,
        "record_id": request.record_id,
        "contents": [_serialize_draft(c) for c in updated_contents],
        "draft_last_modified_at": now.isoformat(),
    }
    await edit_session_manager.broadcast_to_editors(
        request.record_type,
        request.record_id,
        broadcast_payload,
        exclude_user_id=user.id,
    )

    return {
        "status": "ok",
        "draft_last_modified_at": now.isoformat(),
        "contents": [_serialize_draft(c) for c in updated_contents],
    }


@router.post("/publish")
async def publish(
    request: PublishRequest,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
):
    """Promote draft_* fields to live fields, snapshot a revision, set published=True."""
    MainModel, ContentModel, RevisionModel, rev_fk = _resolve_models(
        request.record_type
    )

    main = db.query(MainModel).filter(MainModel.id == request.record_id).first()
    if not main:
        raise HTTPException(status_code=404, detail="Record not found")

    [allowed, _scope] = main._check_has_permission(PermissionAction.write, user)
    if not allowed:
        raise HTTPException(status_code=403, detail="Permission denied")

    fields = _field_list(request.record_type)

    contents_to_publish = main.contents
    if request.content_id is not None:
        contents_to_publish = [c for c in main.contents if c.id == request.content_id]
        if not contents_to_publish:
            raise HTTPException(status_code=404, detail="Content not found on record")

    for content in contents_to_publish:
        # Promote the draft if there is one; otherwise we're just re-flipping
        # published back on for this language with its existing live fields.
        if content.has_draft:
            old_content_text = content.content

            for field in fields:
                draft_attr = f"draft_{field}"
                if hasattr(content, draft_attr):
                    new_val = getattr(content, draft_attr)
                    # Only copy fields that were actually set in the draft. We use
                    # has_draft as the gate for the record as a whole; for individual
                    # fields, a null draft value means "unchanged" not "clear".
                    if new_val is not None:
                        setattr(content, field, new_val)
                    setattr(content, draft_attr, None)

            content.has_draft = False
            content.draft_last_modified_at = None
            content.draft_updated_by_id = None
            content.last_modified_at = datetime.now(timezone.utc)
            content.updated_by_id = user.id

            # Revision records the live-content transition for this publish event.
            revision_count = (
                db.query(RevisionModel)
                .filter(getattr(RevisionModel, rev_fk) == content.id)
                .count()
            )
            RevisionModel.create(
                db,
                user,
                {
                    rev_fk: content.id,
                    "old_content": old_content_text,
                    "new_content": content.content,
                    "name": f"Published by {_user_display_name(user)}",
                    "revision_number": revision_count + 1,
                },
            )

        content.published = True

    if request.parent_fields:
        for k, v in request.parent_fields.items():
            if hasattr(main, k):
                setattr(main, k, v)

    # Parent published flag is derived: true if any language is live.
    main.published = any(c.published for c in main.contents)
    db.commit()
    db.refresh(main)

    await edit_session_manager.broadcast_to_editors(
        request.record_type,
        request.record_id,
        {
            "type": "published",
            "origin_user_id": user.id,
            "origin_user": {
                "user_id": user.id,
                "display_name": _user_display_name(user),
                "image_name": _user_image_name(user),
            },
            "record_type": request.record_type,
            "record_id": request.record_id,
        },
    )

    return {"status": "ok", "published": True}


@router.post("/unpublish")
async def unpublish(
    request: UnpublishRequest,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
):
    """Flip published=False. Draft and live fields are left intact.

    Scoped to a single content when content_id is set, otherwise unpublishes all
    languages. The parent published flag is derived from the contents.
    """
    MainModel, ContentModel, _, _ = _resolve_models(request.record_type)

    main = db.query(MainModel).filter(MainModel.id == request.record_id).first()
    if not main:
        raise HTTPException(status_code=404, detail="Record not found")

    [allowed, _scope] = main._check_has_permission(PermissionAction.write, user)
    if not allowed:
        raise HTTPException(status_code=403, detail="Permission denied")

    contents_to_unpublish = main.contents
    if request.content_id is not None:
        contents_to_unpublish = [c for c in main.contents if c.id == request.content_id]
        if not contents_to_unpublish:
            raise HTTPException(status_code=404, detail="Content not found on record")

    for content in contents_to_unpublish:
        content.published = False

    main.published = any(c.published for c in main.contents)
    db.commit()

    await edit_session_manager.broadcast_to_editors(
        request.record_type,
        request.record_id,
        {
            "type": "unpublished",
            "origin_user_id": user.id,
            "record_type": request.record_type,
            "record_id": request.record_id,
        },
    )

    return {"status": "ok", "published": main.published}


@router.post("/revert")
async def revert(
    request: RevertRequest,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
):
    """Discard draft_* fields. Scoped to a single content when content_id is set, otherwise all languages."""
    MainModel, _, _, _ = _resolve_models(request.record_type)

    main = db.query(MainModel).filter(MainModel.id == request.record_id).first()
    if not main:
        raise HTTPException(status_code=404, detail="Record not found")

    [allowed, _scope] = main._check_has_permission(PermissionAction.write, user)
    if not allowed:
        raise HTTPException(status_code=403, detail="Permission denied")

    fields = _field_list(request.record_type)

    contents_to_revert = main.contents
    if request.content_id is not None:
        contents_to_revert = [c for c in main.contents if c.id == request.content_id]
        if not contents_to_revert:
            raise HTTPException(status_code=404, detail="Content not found on record")

    for content in contents_to_revert:
        if not content.has_draft:
            continue
        for field in fields:
            draft_attr = f"draft_{field}"
            if hasattr(content, draft_attr):
                setattr(content, draft_attr, None)
        content.has_draft = False
        content.draft_last_modified_at = None
        content.draft_updated_by_id = None

    db.commit()

    await edit_session_manager.broadcast_to_editors(
        request.record_type,
        request.record_id,
        {
            "type": "reverted",
            "origin_user_id": user.id,
            "record_type": request.record_type,
            "record_id": request.record_id,
        },
    )

    return {"status": "ok"}
