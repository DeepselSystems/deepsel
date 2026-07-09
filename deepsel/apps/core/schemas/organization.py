from datetime import datetime
from typing import Optional, Any
from pydantic import BaseModel, ConfigDict
from deepsel.apps.core.types.shared_datatypes import CMSSettingsEncryptedDataReadSSchema


class LocaleSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: Optional[int] = None
    name: Optional[str] = None
    iso_code: Optional[str] = None


class AttachmentSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: Optional[int] = None
    name: Optional[str] = None
    type: Optional[str] = None
    content_type: Optional[str] = None
    filesize: Optional[int] = None
    alt_text: Optional[str] = None


class OpenRouterModelSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: Optional[int] = None
    canonical_slug: Optional[str] = None
    name: Optional[str] = None


class ReadSchema(CMSSettingsEncryptedDataReadSSchema):
    model_config = ConfigDict(from_attributes=True)

    id: Optional[int] = None
    name: Optional[str] = None
    string_id: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    active: Optional[bool] = None
    system: Optional[bool] = None
    owner_id: Optional[int] = None
    organization_id: Optional[int] = None

    # address
    street: Optional[str] = None
    street2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip: Optional[str] = None
    country: Optional[str] = None

    # image
    image_attachment_id: Optional[int] = None
    image: Optional[AttachmentSchema] = None

    # mail settings (may be null for non-admin users)
    mail_username: Optional[str] = None
    mail_password: Optional[str] = None
    mail_timeout: Optional[int] = None
    mail_from: Optional[str] = None
    mail_port: Optional[str] = None
    mail_server: Optional[str] = None
    mail_from_name: Optional[str] = None
    mail_validate_certs: Optional[bool] = None
    mail_use_credentials: Optional[bool] = None
    mail_ssl_tls: Optional[bool] = None
    mail_starttls: Optional[bool] = None
    mail_send_rate_limit_per_hour: Optional[int] = None

    # auth settings
    access_token_expire_minutes: Optional[int] = None
    require_2fa_all_users: Optional[bool] = None
    allow_public_signup: Optional[bool] = None
    enable_auth: Optional[bool] = None

    # SAML — columns provided by the optional `saml` extension app (populated
    # when installed; the fields stay in the schema so the org API shape is stable)
    is_enabled_saml: Optional[bool] = None
    saml_idp_entity_id: Optional[str] = None
    saml_idp_sso_url: Optional[str] = None
    saml_idp_x509_cert: Optional[str] = None
    saml_sp_entity_id: Optional[str] = None
    saml_sp_acs_url: Optional[str] = None
    saml_sp_sls_url: Optional[str] = None
    saml_attribute_mapping: Optional[Any] = None

    current_version: Optional[str] = None

    # CMS fields
    domains: Optional[Any] = None
    available_languages: Optional[Any] = None
    default_language_id: Optional[int] = None
    default_language: Optional[LocaleSchema] = None
    auto_translate_pages: Optional[bool] = None
    auto_translate_posts: Optional[bool] = None
    auto_translate_components: Optional[bool] = None
    openai_api_key: Optional[str] = None
    show_post_author: Optional[bool] = None
    show_post_date: Optional[bool] = None
    blog_posts_per_page: Optional[int] = None
    show_chatbox: Optional[bool] = None
    website_custom_code: Optional[str] = None
    selected_theme: Optional[str] = None

    # AI model relationships
    ai_translation_model_id: Optional[int] = None
    ai_translation_model: Optional[OpenRouterModelSchema] = None
    ai_default_writing_model_id: Optional[int] = None
    ai_default_writing_model: Optional[OpenRouterModelSchema] = None
    ai_autocomplete_model_id: Optional[int] = None
    ai_autocomplete_model: Optional[OpenRouterModelSchema] = None
    chatbox_model_id: Optional[int] = None
    chatbox_model: Optional[OpenRouterModelSchema] = None


class SearchSchema(BaseModel):
    total: int
    data: list[ReadSchema]


class CreateSchema(BaseModel):
    name: str
    organization_id: Optional[int] = None

    # address
    street: Optional[str] = None
    street2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip: Optional[str] = None
    country: Optional[str] = None

    image_attachment_id: Optional[int] = None

    # mail settings
    mail_username: Optional[str] = None
    mail_password: Optional[str] = None
    mail_timeout: Optional[int] = None
    mail_from: Optional[str] = None
    mail_port: Optional[str] = None
    mail_server: Optional[str] = None
    mail_from_name: Optional[str] = None
    mail_validate_certs: Optional[bool] = None
    mail_use_credentials: Optional[bool] = None
    mail_ssl_tls: Optional[bool] = None
    mail_starttls: Optional[bool] = None
    mail_send_rate_limit_per_hour: Optional[int] = None

    # auth settings
    access_token_expire_minutes: Optional[int] = None
    require_2fa_all_users: Optional[bool] = None
    allow_public_signup: Optional[bool] = None
    enable_auth: Optional[bool] = None

    # SAML — columns provided by the optional `saml` extension app (populated
    # when installed; the fields stay in the schema so the org API shape is stable)
    is_enabled_saml: Optional[bool] = None
    saml_idp_entity_id: Optional[str] = None
    saml_idp_sso_url: Optional[str] = None
    saml_idp_x509_cert: Optional[str] = None
    saml_sp_entity_id: Optional[str] = None
    saml_sp_acs_url: Optional[str] = None
    saml_sp_sls_url: Optional[str] = None
    saml_attribute_mapping: Optional[Any] = None

    # CMS fields
    domains: Optional[Any] = None
    available_languages: Optional[Any] = None
    default_language_id: Optional[int] = None
    auto_translate_pages: Optional[bool] = None
    auto_translate_posts: Optional[bool] = None
    auto_translate_components: Optional[bool] = None
    openrouter_api_key: Optional[str] = None
    openai_api_key: Optional[str] = None
    show_post_author: Optional[bool] = None
    show_post_date: Optional[bool] = None
    blog_posts_per_page: Optional[int] = None
    show_chatbox: Optional[bool] = None
    website_custom_code: Optional[str] = None
    selected_theme: Optional[str] = None

    ai_translation_model_id: Optional[int] = None
    ai_default_writing_model_id: Optional[int] = None
    ai_autocomplete_model_id: Optional[int] = None
    chatbox_model_id: Optional[int] = None


class UpdateSchema(BaseModel):
    name: Optional[str] = None
    string_id: Optional[str] = None
    active: Optional[bool] = None

    # address
    street: Optional[str] = None
    street2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip: Optional[str] = None
    country: Optional[str] = None

    image_attachment_id: Optional[int] = None

    # mail settings
    mail_username: Optional[str] = None
    mail_password: Optional[str] = None
    mail_timeout: Optional[int] = None
    mail_from: Optional[str] = None
    mail_port: Optional[str] = None
    mail_server: Optional[str] = None
    mail_from_name: Optional[str] = None
    mail_validate_certs: Optional[bool] = None
    mail_use_credentials: Optional[bool] = None
    mail_ssl_tls: Optional[bool] = None
    mail_starttls: Optional[bool] = None
    mail_send_rate_limit_per_hour: Optional[int] = None

    # auth settings
    access_token_expire_minutes: Optional[int] = None
    require_2fa_all_users: Optional[bool] = None
    allow_public_signup: Optional[bool] = None
    enable_auth: Optional[bool] = None

    # SAML — columns provided by the optional `saml` extension app (populated
    # when installed; the fields stay in the schema so the org API shape is stable)
    is_enabled_saml: Optional[bool] = None
    saml_idp_entity_id: Optional[str] = None
    saml_idp_sso_url: Optional[str] = None
    saml_idp_x509_cert: Optional[str] = None
    saml_sp_entity_id: Optional[str] = None
    saml_sp_acs_url: Optional[str] = None
    saml_sp_sls_url: Optional[str] = None
    saml_attribute_mapping: Optional[Any] = None

    current_version: Optional[str] = None

    # CMS fields
    domains: Optional[Any] = None
    available_languages: Optional[Any] = None
    default_language_id: Optional[int] = None
    auto_translate_pages: Optional[bool] = None
    auto_translate_posts: Optional[bool] = None
    auto_translate_components: Optional[bool] = None
    openrouter_api_key: Optional[str] = None
    openai_api_key: Optional[str] = None
    show_post_author: Optional[bool] = None
    show_post_date: Optional[bool] = None
    blog_posts_per_page: Optional[int] = None
    show_chatbox: Optional[bool] = None
    website_custom_code: Optional[str] = None
    selected_theme: Optional[str] = None

    ai_translation_model_id: Optional[int] = None
    ai_default_writing_model_id: Optional[int] = None
    ai_autocomplete_model_id: Optional[int] = None
    chatbox_model_id: Optional[int] = None
