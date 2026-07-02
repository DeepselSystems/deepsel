from typing import Optional
from pydantic import BaseModel, field_serializer, computed_field
from deepsel.utils.secret_utils import truncate_secret


class LocaleData(BaseModel):
    """Locale data structure"""

    id: int
    name: str
    iso_code: str
    emoji_flag: Optional[str] = None


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
    allow_indexing: bool = True  # Controls search engine indexing


class CMSSettingsEncryptedDataReadSSchema(BaseModel):
    openrouter_api_key: Optional[str] = None  # This value is not returned.

    # region Openrouter api key
    @field_serializer("openrouter_api_key", mode="plain")
    def serialize_openrouter_api_key(self, value):
        """Don't allow return. Instead, returns in the field "openrouter_api_key_truncated" """
        return None

    @computed_field
    @property
    def openrouter_api_key_truncated(self) -> Optional[str]:
        """Return truncated version of openrouter_api_key like 'first_part...last_part'"""
        return truncate_secret(self.openrouter_api_key)

    # endregion Openrouter api key
