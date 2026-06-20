from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict
from ._nested import UserNested
from .blog_post_content import (
    BlogPostContentCreateNested,
    BlogPostContentRead,
)


class BlogPostRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    published: Optional[bool] = False
    slug: Optional[str] = None
    publish_date: Optional[datetime] = None
    author_id: Optional[int] = None
    author: Optional[UserNested] = None
    require_login: Optional[bool] = False
    blog_post_custom_code: Optional[str] = None
    contents: list[BlogPostContentRead] = []
    organization_id: Optional[int] = None
    owner_id: Optional[int] = None
    string_id: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    active: Optional[bool] = True
    system: Optional[bool] = False


class BlogPostCreate(BaseModel):
    published: Optional[bool] = False
    slug: Optional[str] = None
    publish_date: Optional[datetime] = None
    author_id: Optional[int] = None
    require_login: Optional[bool] = False
    blog_post_custom_code: Optional[str] = None
    contents: Optional[list[BlogPostContentCreateNested]] = []
    organization_id: Optional[int] = None


class BlogPostUpdate(BaseModel):
    published: Optional[bool] = None
    slug: Optional[str] = None
    publish_date: Optional[datetime] = None
    author_id: Optional[int] = None
    require_login: Optional[bool] = None
    blog_post_custom_code: Optional[str] = None
    contents: Optional[list[BlogPostContentCreateNested]] = None
    string_id: Optional[str] = None


class BlogPostSearch(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    total: int
    data: list[BlogPostRead]
