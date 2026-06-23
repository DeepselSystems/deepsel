import logging
import os
import re
from typing import Optional

from fastapi import UploadFile
from sqlalchemy import or_
from sqlalchemy.orm import Session

from deepsel.types.attachment import (
    AttachmentUsageItem,
    AttachmentVersionUpsertItem,
    UpsertItemResult,
)
from deepsel.utils.models_pool import models_pool

logger = logging.getLogger(__name__)

AttachmentLocaleVersionModel = models_pool["attachment_locale_version"]
AttachmentModel = models_pool["attachment"]

PLACEHOLDER_SVG = (
    '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">'
    '<rect x="0.5" y="0.5" width="79" height="79" fill="none"'
    ' stroke="#d1d5db" stroke-width="1" stroke-dasharray="4 3" rx="4"/>'
    '<text x="40" y="26" font-family="sans-serif" font-size="10" fill="#9ca3af"'
    ' font-style="italic" text-anchor="middle">File not</text>'
    '<text x="40" y="40" font-family="sans-serif" font-size="10" fill="#9ca3af"'
    ' font-style="italic" text-anchor="middle">available for</text>'
    '<text x="40" y="54" font-family="sans-serif" font-size="10" fill="#9ca3af"'
    ' font-style="italic" text-anchor="middle">this locale</text>'
    "</svg>"
)

# Captures the full args string inside every {{ attachment(...) }} call.
# Works for both single-image and multi-image (gallery) calls.
_ATTACHMENT_CALL_RE = re.compile(r"\{\{-?\s*attachment\(([\s\S]*?)\)\s*\}\}")

# Finds individual single-quoted string args within an attachment() call.
_QUOTED_ARG_RE = re.compile(r"'([^']*)'")


def _extract_attachment_names(content: str) -> set[str]:
    """
    Return all attachment names referenced anywhere in content via attachment() calls.

    Handles both single-image {{ attachment('name') }} and multi-image gallery calls
    {{ attachment('img1', 'img2', 'configJSON') }}. The last arg is skipped when it is
    a JSON config string (starts with '{').
    """
    names: set[str] = set()
    for call_match in _ATTACHMENT_CALL_RE.finditer(content):
        args_str = call_match.group(1)
        quoted = [m.group(1) for m in _QUOTED_ARG_RE.finditer(args_str)]
        # Skip last arg if it is a JSON gallery/attrs config.
        if quoted and quoted[-1].strip().startswith("{"):
            quoted = quoted[:-1]
        names.update(quoted)
    return names


def resolve_unique_attachment_name(filename: str, db: Session) -> str:
    """
    Derive a unique AttachmentModel.name from an uploaded filename.

    Uses only the base name (no extension) so the slug stays clean.
    On conflict appends a numeric suffix: ``report``, ``report-1``, ``report-2``, …
    """
    from deepsel.utils.filename import sanitize_filename

    base, _ = os.path.splitext(filename)
    sanitized = sanitize_filename(base) if base else sanitize_filename(filename)
    if not sanitized:
        sanitized = "file"

    candidate = sanitized
    if not db.query(AttachmentModel).filter(AttachmentModel.name == candidate).first():
        return candidate

    counter = 1
    while True:
        candidate = f"{sanitized}-{counter}"
        if (
            not db.query(AttachmentModel)
            .filter(AttachmentModel.name == candidate)
            .first()
        ):
            return candidate
        counter += 1


def upsert_locale_versions(
    attachment_id: int,
    items: list[AttachmentVersionUpsertItem],
    item_file_map: dict[int, UploadFile],
    db: Session,
    user,
    organization_id,
) -> list[UpsertItemResult]:
    """
    Apply batch locale-version update-inserts for a single attachment.

    Each item is processed independently — a failure on one item does not stop
    the others. The caller receives a per-item result list so it can surface
    partial failures without relying on transaction rollback (which cannot undo
    file-storage operations on S3/Azure/local).

    Step 1 — new versions (attachment_locale_version_id is None):
        Delete any existing version for the same locale, then create a new one.

    Step 2 — existing versions (attachment_locale_version_id is not None):
        If a replacement file is provided (item_file_map contains the item index),
        delete the old version and create a new one preserving the same ID.
        Otherwise update only the metadata fields that changed.

    Args:
        attachment_id:  ID of the parent attachment record.
        items:          Parsed and validated upsert items.
        item_file_map:  Mapping of item list index → UploadFile for items that carry a file.
        db:             Active SQLAlchemy session.
        user:           Authenticated user passed to ORM create/update/delete calls.
        organization_id: ID of the organization associated with the attachment.

    Returns:
        List of UpsertItemResult, one per item, in the same order as items.
    """
    results: list[UpsertItemResult] = []

    # Step 1: create new locale versions (attachment_locale_version_id is None)
    for idx, item in enumerate(items):
        if item.attachment_locale_version_id is not None:
            continue

        try:
            file = item_file_map[idx]

            existing = (
                db.query(AttachmentLocaleVersionModel)
                .filter(
                    AttachmentLocaleVersionModel.attachment_id == attachment_id,
                    AttachmentLocaleVersionModel.locale_id == item.locale_id,
                )
                .first()
            )
            if existing:
                existing.delete(db=db, user=user)

            # Build filename: user-supplied base name + original file extension.
            # Extension comes from the uploaded file (frontend renames it to
            # "<_file_id>.<ext>") and must not be altered.
            _, ext = os.path.splitext(file.filename)
            base = item.name if item.name else os.path.splitext(file.filename)[0]
            file.filename = base + ext

            kwargs = {}
            if item.alt_text:
                kwargs["alt_text"] = item.alt_text

            file.file.seek(0)
            AttachmentLocaleVersionModel().create(
                db=db,
                user=user,
                file=file,
                attachment_id=attachment_id,
                locale_id=item.locale_id,
                organization_id=organization_id,
                **kwargs,
            )

            results.append(
                UpsertItemResult(
                    index=idx,
                    locale_id=item.locale_id,
                    attachment_locale_version_id=None,
                    success=True,
                )
            )
        except Exception as exc:
            logger.error(
                "batch_upsert step1 idx=%d locale_id=%d: %s", idx, item.locale_id, exc
            )
            results.append(
                UpsertItemResult(
                    index=idx,
                    locale_id=item.locale_id,
                    attachment_locale_version_id=None,
                    success=False,
                    error=str(exc),
                )
            )

    # Step 2: update existing locale versions (attachment_locale_version_id is not None)
    for idx, item in enumerate(items):
        if item.attachment_locale_version_id is None:
            continue

        try:
            version = (
                db.query(AttachmentLocaleVersionModel)
                .filter(
                    AttachmentLocaleVersionModel.id == item.attachment_locale_version_id
                )
                .first()
            )  # guaranteed to exist — validated by the caller before this function is invoked

            effective_alt = (
                item.alt_text if item.alt_text is not None else version.alt_text
            )

            file = item_file_map.get(idx)
            if file is not None:
                # File replacement: delete the old record and create a new one.
                # The new record gets a new auto-incremented ID — ID is NOT preserved.
                # FE handles this correctly by consuming the full locale_versions list
                # returned in BatchUpsertResponse rather than tracking IDs.
                #
                # Filename = user-supplied base name (item.name, no extension) +
                # extension from the uploaded file. Extension is immutable — it
                # always follows the new file, not the old record.
                existing_base, _ = os.path.splitext(version.name)
                effective_base = item.name if item.name is not None else existing_base
                _, ext = os.path.splitext(file.filename)
                effective_name = effective_base + ext

                version.delete(db=db, user=user)
                file.filename = effective_name
                file.file.seek(0)
                AttachmentLocaleVersionModel().create(
                    db=db,
                    user=user,
                    file=file,
                    attachment_id=attachment_id,
                    locale_id=item.locale_id,
                    alt_text=effective_alt,
                    organization_id=organization_id,
                )
            else:
                # Metadata-only update: alt_text and/or file name can change.
                # Name changes are handled via rename_in_storage() so the storage
                # object and the DB record stay in sync.
                update_data = {}
                if effective_alt != version.alt_text:
                    update_data["alt_text"] = effective_alt

                if item.name:
                    existing_base, existing_ext = os.path.splitext(version.name)
                    # Only rename when the requested base name actually differs from
                    # the current one. Extension is always preserved from the existing
                    # file — it cannot be changed without uploading a new file.
                    if item.name != existing_base:
                        version.rename_in_storage(item.name + existing_ext, db=db)

                if update_data:
                    version.update(db=db, user=user, values=update_data)

            results.append(
                UpsertItemResult(
                    index=idx,
                    locale_id=item.locale_id,
                    attachment_locale_version_id=item.attachment_locale_version_id,
                    success=True,
                )
            )
        except Exception as exc:
            logger.error(
                "batch_upsert step2 idx=%d locale_version_id=%d: %s",
                idx,
                item.attachment_locale_version_id,
                exc,
            )
            results.append(
                UpsertItemResult(
                    index=idx,
                    locale_id=item.locale_id,
                    attachment_locale_version_id=item.attachment_locale_version_id,
                    success=False,
                    error=str(exc),
                )
            )

    return results


def find_attachment_usages(
    attachment_name: str,
    db: Session,
    locale_id: Optional[int] = None,
    attachment_id: Optional[int] = None,
) -> list[AttachmentUsageItem]:
    """
    Search all content tables for usages of attachment_name.

    Covers:
    - Jinja {{ attachment(...) }} calls in content/draft_content text
    - FK image columns: blog_post_content.featured_image_id,
      blog_post_content.seo_metadata_featured_image_id (published + draft),
      page_content.seo_metadata_featured_image_id (published + draft)

    Args:
        attachment_name: The AttachmentModel.name slug to search for.
        locale_id:       When provided, restrict results to that locale.
        attachment_id:   The attachment PK — used for FK column checks.
                         Looked up by name if not supplied.

    Returns:
        List of AttachmentUsageItem, one per matching content row × draft flag.
    """
    from apps.cms.models.page_content import PageContentModel
    from apps.cms.models.blog_post_content import BlogPostContentModel
    from apps.cms.models.template_content import TemplateContentModel
    from apps.cms.models.template import TemplateModel

    # Resolve attachment_id for FK column checks when not passed in.
    if attachment_id is None:
        att = (
            db.query(AttachmentModel)
            .filter(AttachmentModel.name == attachment_name)
            .first()
        )
        attachment_id = att.id if att else None

    # SQL LIKE pre-filter: matches any attachment() call that contains this name as a
    # quoted arg — works for both single-image and multi-image gallery calls regardless
    # of argument position. Python-level confirmation via _extract_attachment_names()
    # eliminates any false positives from the broad pattern.
    like_pattern = f"%attachment(%%'{attachment_name}'%"

    usages: list[AttachmentUsageItem] = []

    # --- page_content (published + draft) ---
    page_q = db.query(PageContentModel).filter(
        or_(
            PageContentModel.content.like(like_pattern),
            PageContentModel.draft_content.like(like_pattern),
        )
    )
    if locale_id is not None:
        page_q = page_q.filter(PageContentModel.locale_id == locale_id)
    for row in page_q.all():
        found_in_published = attachment_name in _extract_attachment_names(
            row.content or ""
        )
        found_in_draft = attachment_name in _extract_attachment_names(
            row.draft_content or ""
        )
        for is_draft in (False, True):
            if (is_draft and found_in_draft) or (not is_draft and found_in_published):
                usages.append(
                    AttachmentUsageItem(
                        content_type="page",
                        content_id=row.id,
                        parent_id=row.page_id,
                        locale_id=row.locale_id,
                        locale=row.locale,
                        title=row.title,
                        edit_path=f"/pages/{row.page_id}/edit",
                        is_draft=is_draft,
                    )
                )

    # --- blog_post_content (published + draft) ---
    blog_q = db.query(BlogPostContentModel).filter(
        or_(
            BlogPostContentModel.content.like(like_pattern),
            BlogPostContentModel.draft_content.like(like_pattern),
        )
    )
    if locale_id is not None:
        blog_q = blog_q.filter(BlogPostContentModel.locale_id == locale_id)
    for row in blog_q.all():
        found_in_published = attachment_name in _extract_attachment_names(
            row.content or ""
        )
        found_in_draft = attachment_name in _extract_attachment_names(
            row.draft_content or ""
        )
        for is_draft in (False, True):
            if (is_draft and found_in_draft) or (not is_draft and found_in_published):
                usages.append(
                    AttachmentUsageItem(
                        content_type="blog_post",
                        content_id=row.id,
                        parent_id=row.post_id,
                        locale_id=row.locale_id,
                        locale=row.locale,
                        title=row.title,
                        edit_path=f"/blog_posts/{row.post_id}/edit",
                        is_draft=is_draft,
                    )
                )

    # --- template_content ---
    tpl_q = db.query(TemplateContentModel).filter(
        TemplateContentModel.content.like(like_pattern)
    )
    if locale_id is not None:
        tpl_q = tpl_q.filter(TemplateContentModel.locale_id == locale_id)
    for row in tpl_q.all():
        if attachment_name not in _extract_attachment_names(row.content or ""):
            continue
        # Fetch template name for the title label
        template = (
            db.query(TemplateModel).filter(TemplateModel.id == row.template_id).first()
        )
        usages.append(
            AttachmentUsageItem(
                content_type="template",
                content_id=row.id,
                parent_id=row.template_id,
                locale_id=row.locale_id,
                locale=row.locale,
                title=template.name if template else None,
                edit_path=f"/templates/{row.template_id}/edit",
            )
        )

    # --- FK image columns (attachment_id-based, not text-based) ---
    if attachment_id is not None:
        # Set of (content_type, content_id, is_draft) already recorded from text search
        # to avoid emitting duplicate usage items for the same row.
        seen = {(u.content_type, u.content_id, u.is_draft) for u in usages}

        # blog_post_content: featured_image + SEO featured image (published + draft)
        blog_img_q = db.query(BlogPostContentModel).filter(
            or_(
                BlogPostContentModel.featured_image_id == attachment_id,
                BlogPostContentModel.draft_featured_image_id == attachment_id,
                BlogPostContentModel.seo_metadata_featured_image_id == attachment_id,
                BlogPostContentModel.draft_seo_metadata_featured_image_id
                == attachment_id,
            )
        )
        if locale_id is not None:
            blog_img_q = blog_img_q.filter(BlogPostContentModel.locale_id == locale_id)
        for row in blog_img_q.all():
            in_published = (
                row.featured_image_id == attachment_id
                or row.seo_metadata_featured_image_id == attachment_id
            )
            in_draft = (
                row.draft_featured_image_id == attachment_id
                or row.draft_seo_metadata_featured_image_id == attachment_id
            )
            for is_draft in (False, True):
                if not ((is_draft and in_draft) or (not is_draft and in_published)):
                    continue
                key = ("blog_post", row.id, is_draft)
                if key not in seen:
                    seen.add(key)
                    usages.append(
                        AttachmentUsageItem(
                            content_type="blog_post",
                            content_id=row.id,
                            parent_id=row.post_id,
                            locale_id=row.locale_id,
                            locale=row.locale,
                            title=row.title,
                            edit_path=f"/blog_posts/{row.post_id}/edit",
                            is_draft=is_draft,
                        )
                    )

        # page_content: SEO featured image (published + draft)
        page_img_q = db.query(PageContentModel).filter(
            or_(
                PageContentModel.seo_metadata_featured_image_id == attachment_id,
                PageContentModel.draft_seo_metadata_featured_image_id == attachment_id,
            )
        )
        if locale_id is not None:
            page_img_q = page_img_q.filter(PageContentModel.locale_id == locale_id)
        for row in page_img_q.all():
            in_published = row.seo_metadata_featured_image_id == attachment_id
            in_draft = row.draft_seo_metadata_featured_image_id == attachment_id
            for is_draft in (False, True):
                if not ((is_draft and in_draft) or (not is_draft and in_published)):
                    continue
                key = ("page", row.id, is_draft)
                if key not in seen:
                    seen.add(key)
                    usages.append(
                        AttachmentUsageItem(
                            content_type="page",
                            content_id=row.id,
                            parent_id=row.page_id,
                            locale_id=row.locale_id,
                            locale=row.locale,
                            title=row.title,
                            edit_path=f"/pages/{row.page_id}/edit",
                            is_draft=is_draft,
                        )
                    )

    return usages
