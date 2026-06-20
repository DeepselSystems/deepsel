"""Type definitions for blog-related data structures"""

from typing import Optional
from pydantic import BaseModel
from .shared_datatypes import LocaleData


class AuthorData(BaseModel):
    """Author data structure for blog posts"""

    id: int
    display_name: Optional[str]
    username: Optional[str] = None
    image: Optional[str]


class LanguageAlternative(BaseModel):
    """Language alternative structure"""

    slug: str
    locale: LocaleData


class BlogPostListItem(BaseModel):
    """Blog post list item structure"""

    id: int
    title: str
    slug: str
    excerpt: Optional[str]
    featured_image_id: Optional[int]
    featured_image_name: Optional[str]
    publish_date: Optional[str]
    author: Optional[AuthorData]
    lang: str
