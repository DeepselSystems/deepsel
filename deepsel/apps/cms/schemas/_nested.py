from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class LocaleNested(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    iso_code: str


class AttachmentLocaleVersionNested(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    type: Optional[str] = None
    content_type: Optional[str] = None
    filesize: Optional[int] = None
    alt_text: Optional[str] = None
    locale_id: Optional[int] = None
    locale: Optional[LocaleNested] = None


class AttachmentNested(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    type: Optional[str] = None
    content_type: Optional[str] = None
    filesize: Optional[int] = None
    alt_text: Optional[str] = None
    string_id: Optional[str] = None
    locale_versions: list[AttachmentLocaleVersionNested] = []


class UserNested(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: Optional[str] = None
    name: Optional[str] = None
    email: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None


class ContentParentNested(BaseModel):
    """Minimal parent content info embedded in revision records for rendering context."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    organization_id: Optional[int] = None
    locale: Optional[LocaleNested] = None


class PageContentRevisionNested(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: Optional[str] = None
    revision_number: Optional[int] = None
    old_content: Optional[str] = None
    new_content: Optional[str] = None
    string_id: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class BlogPostContentRevisionNested(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: Optional[str] = None
    revision_number: Optional[int] = None
    old_content: Optional[str] = None
    new_content: Optional[str] = None
    string_id: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
