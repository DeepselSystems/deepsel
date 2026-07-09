"""Type definitions for public settings data structures"""

from typing import Optional
from pydantic import BaseModel
from deepsel.types.locale import LocaleData
from .menu import MenuItem


class PublicSettings(BaseModel):
    """Public settings returned by CMSSettingsModel.get_public_settings"""

    # Base organization fields (from parent OrganizationModel)
    id: int
    name: str
    access_token_expire_minutes: int
    require_2fa_all_users: bool
    allow_public_signup: bool
    is_enabled_oidc: bool = False
    authless: bool

    # CMS-specific fields (from CMSSettingsModel.get_public_settings)
    domains: list[str]
    available_languages: list[LocaleData]
    default_language: Optional[LocaleData] = None
    auto_translate_pages: bool
    auto_translate_posts: bool
    auto_translate_components: bool
    has_openai_api_key: bool
    has_openrouter_api_key: bool
    ai_autocomplete_model_id: Optional[int] = None
    ai_default_writing_model_id: Optional[int] = None
    show_post_author: bool
    show_post_date: bool
    show_chatbox: bool
    website_custom_code: Optional[str] = None
    selected_theme: Optional[str] = None
    theme_key: Optional[str] = None
    menus: list[MenuItem]
