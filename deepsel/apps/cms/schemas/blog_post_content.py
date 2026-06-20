from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict

from ._nested import (
    AttachmentNested,
    BlogPostContentRevisionNested,
    LocaleNested,
    UserNested,
)


class BlogPostContentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    subtitle: Optional[str] = None
    content: Optional[str] = None
    reading_length: Optional[str] = None
    locale_id: Optional[int] = None
    locale: Optional[LocaleNested] = None
    post_id: Optional[int] = None
    featured_image_id: Optional[int] = None
    featured_image: Optional[AttachmentNested] = None
    seo_metadata_title: Optional[str] = None
    seo_metadata_description: Optional[str] = None
    seo_metadata_featured_image_id: Optional[int] = None
    seo_metadata_featured_image: Optional[AttachmentNested] = None
    seo_metadata_allow_indexing: Optional[bool] = True
    custom_code: Optional[str] = None
    published: Optional[bool] = False
    last_modified_at: Optional[datetime] = None
    updated_by_id: Optional[int] = None
    updated_by: Optional[UserNested] = None
    has_draft: Optional[bool] = False
    draft_title: Optional[str] = None
    draft_subtitle: Optional[str] = None
    draft_content: Optional[str] = None
    draft_reading_length: Optional[str] = None
    draft_featured_image_id: Optional[int] = None
    draft_featured_image: Optional[AttachmentNested] = None
    draft_seo_metadata_title: Optional[str] = None
    draft_seo_metadata_description: Optional[str] = None
    draft_seo_metadata_featured_image_id: Optional[int] = None
    draft_seo_metadata_featured_image: Optional[AttachmentNested] = None
    draft_seo_metadata_allow_indexing: Optional[bool] = None
    draft_custom_code: Optional[str] = None
    draft_last_modified_at: Optional[datetime] = None
    draft_updated_by_id: Optional[int] = None
    draft_updated_by: Optional[UserNested] = None
    revisions: list[BlogPostContentRevisionNested] = []
    organization_id: Optional[int] = None
    owner_id: Optional[int] = None
    string_id: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    active: Optional[bool] = True
    system: Optional[bool] = False


class BlogPostContentCreate(BaseModel):
    title: str
    subtitle: Optional[str] = None
    content: Optional[str] = None
    reading_length: Optional[str] = None
    locale_id: int
    post_id: Optional[int] = None
    featured_image_id: Optional[int] = None
    seo_metadata_title: Optional[str] = None
    seo_metadata_description: Optional[str] = None
    seo_metadata_featured_image_id: Optional[int] = None
    seo_metadata_allow_indexing: Optional[bool] = True
    custom_code: Optional[str] = None
    organization_id: Optional[int] = None


class BlogPostContentCreateNested(BaseModel):
    id: Optional[int] = None
    title: str
    subtitle: Optional[str] = None
    content: Optional[str] = None
    reading_length: Optional[str] = None
    locale_id: int
    featured_image_id: Optional[int] = None
    seo_metadata_title: Optional[str] = None
    seo_metadata_description: Optional[str] = None
    seo_metadata_featured_image_id: Optional[int] = None
    seo_metadata_allow_indexing: Optional[bool] = True
    custom_code: Optional[str] = None
    organization_id: Optional[int] = None


class BlogPostContentUpdate(BaseModel):
    title: Optional[str] = None
    subtitle: Optional[str] = None
    content: Optional[str] = None
    reading_length: Optional[str] = None
    locale_id: Optional[int] = None
    featured_image_id: Optional[int] = None
    seo_metadata_title: Optional[str] = None
    seo_metadata_description: Optional[str] = None
    seo_metadata_featured_image_id: Optional[int] = None
    seo_metadata_allow_indexing: Optional[bool] = None
    custom_code: Optional[str] = None
    last_modified_at: Optional[datetime] = None
    updated_by_id: Optional[int] = None
    string_id: Optional[str] = None


class BlogPostContentSearch(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    total: int
    data: list[BlogPostContentRead]
