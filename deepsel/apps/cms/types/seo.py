from typing import Optional
from pydantic import BaseModel


class SEOMetadata(BaseModel):
    """SEO metadata for blog post content"""

    title: Optional[str] = None  # SEO title, defaults to blog post content title
    description: Optional[str] = None  # SEO meta description
    featured_image_id: Optional[int] = (
        None  # Featured image (attachment id) for social sharing
    )
    featured_image_name: Optional[str] = (
        None  # Featured image (attachment name) for social sharing
    )
    featured_image_version_name: Optional[str] = (
        None  # SEO-friendly locale version filename, used with /attachment/serve/{name}
    )
    allow_indexing: bool = True  # Controls search engine indexing
