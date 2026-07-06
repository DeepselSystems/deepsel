from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class LocaleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    iso_code: str


class AttachmentBriefRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: Optional[str] = None


class AttachmentLocaleVersionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    type: Optional[str] = None
    content_type: Optional[str] = None
    filesize: Optional[int] = None
    alt_text: Optional[str] = None
    attachment_id: Optional[int] = None
    attachment: Optional[AttachmentBriefRead] = None
    locale_id: Optional[int] = None
    locale: Optional[LocaleRead] = None
    organization_id: Optional[int] = None
    owner_id: Optional[int] = None
    string_id: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    active: Optional[bool] = True
    system: Optional[bool] = False


class AttachmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: Optional[str] = None
    type: Optional[str] = None
    # Deprecated single-lang fields — use locale_versions instead
    content_type: Optional[str] = None
    filesize: Optional[int] = None
    alt_text: Optional[str] = None
    organization_id: Optional[int] = None
    owner_id: Optional[int] = None
    string_id: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    active: Optional[bool] = True
    system: Optional[bool] = False
    locale_versions: list[AttachmentLocaleVersionRead] = []


class AttachmentLocaleVersionUpdateSearch(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    total: int
    data: list[AttachmentLocaleVersionRead]


class AttachmentLocaleVersionUpdate(BaseModel):
    """Patchable fields for a single locale version (file not replaced here)."""

    alt_text: Optional[str] = None
    locale_id: Optional[int] = None


class AttachmentVersionUpsertItem(BaseModel):
    """
    One item in a batch upsert request for attachment locale versions.

    Rules:
    - attachment_locale_version_id=None  →  new version: _file_id, name, alt_text are all required.
    - attachment_locale_version_id=<id>  →  existing version: all fields optional
      (only provided fields are updated; _file_id triggers file replacement).
    - locale_id is always required.
    - attachment_id is passed as a path param on the endpoint, not per-item.

    File matching:
    - Each UploadFile in the multipart request must be named "<_file_id>.<ext>".
    - The endpoint maps files to items by stripping the extension from the filename
      and matching against _file_id. If _file_id is set but no matching file is found,
      the request is rejected with 422.
    """

    model_config = ConfigDict(populate_by_name=True)

    attachment_locale_version_id: Optional[int] = None
    locale_id: int
    alt_text: Optional[str] = None
    name: Optional[str] = None
    file_id: Optional[str] = Field(None, alias="_file_id")

    @model_validator(mode="after")
    def validate_new_version_fields(self) -> "AttachmentVersionUpsertItem":
        if self.attachment_locale_version_id is None:
            missing = [
                field
                for field, value in [
                    ("_file_id", self.file_id),
                    ("name", self.name),
                ]
                if value is None
            ]
            if missing:
                raise ValueError(
                    f"Fields required when creating a new version (attachment_locale_version_id is None): "
                    f"{', '.join(missing)}"
                )
        return self


class UpsertItemResult(BaseModel):
    """Result for a single item in a batch upsert request."""

    index: int
    locale_id: int
    attachment_locale_version_id: Optional[int]
    success: bool
    error: Optional[str] = None


class BatchUpsertResponse(BaseModel):
    """Response for the batch upsert endpoint."""

    attachment: AttachmentRead
    results: list[UpsertItemResult]
    has_errors: bool


class AttachmentUpdate(BaseModel):
    alt_text: Optional[str] = None
    string_id: Optional[str] = None
    active: Optional[bool] = None


class AttachmentSearch(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    total: int
    data: list[AttachmentRead]


class UploadSizeLimitResponse(BaseModel):
    value: float
    unit: str


class StorageInfoResponse(BaseModel):
    used_storage: float  # in MB
    max_storage: float | None  # in MB, None means unlimited
    unit: str


class AttachmentUsageItem(BaseModel):
    """One content record that embeds the attachment via Jinja attachment() call."""

    content_type: str  # "page", "blog_post", or "template"
    content_id: int  # ID of the content record (page_content / blog_post_content / template_content)
    parent_id: int  # ID of the parent (page_id / post_id / template_id)
    locale_id: int
    locale: Optional[LocaleRead] = None
    title: Optional[str] = None  # Human-readable label for the content record
    edit_path: Optional[str] = None  # Admin SPA path, e.g. "/pages/5/edit"
    is_draft: bool = (
        False  # True when the reference is in draft_content, not published content
    )


class AttachmentUsagesResponse(BaseModel):
    attachment_id: int
    attachment_name: Optional[str] = None
    usages: list[AttachmentUsageItem]
