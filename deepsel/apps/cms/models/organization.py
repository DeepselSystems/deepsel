from sqlalchemy import Column, Integer, ForeignKey, JSON, Boolean, String, Text
from sqlalchemy.orm import relationship, Session
from deepsel.deps import settings
from deepsel.utils.crypto import encrypt as _encrypt, decrypt as _decrypt
from deepsel.utils.models_pool import models_pool
import logging

logger = logging.getLogger(__name__)

OrganizationModel = models_pool["organization"]


class CMSSettingsModel(OrganizationModel):
    __table_args__ = {"extend_existing": True}

    # domain settings for multiple sites
    domains = Column(JSON, default=lambda: ["*"])

    # language settings
    available_languages = Column(JSON, default=list)
    default_language_id = Column(Integer, ForeignKey("locale.id"))
    default_language = relationship("LocaleModel", foreign_keys=[default_language_id])

    # auto-translate settings
    auto_translate_pages = Column(Boolean, default=False)
    auto_translate_posts = Column(Boolean, default=False)
    auto_translate_components = Column(Boolean, default=False)
    openai_api_key = Column(String(255), nullable=True)

    # blog settings
    show_post_author = Column(Boolean, default=True)
    show_post_date = Column(Boolean, default=True)
    blog_posts_per_page = Column(Integer, default=6)

    ai_translation_model_id = Column(Integer, ForeignKey("openrouter_model.id"))
    ai_translation_model = relationship(
        "OpenRouterModelModel", foreign_keys=[ai_translation_model_id]
    )

    ai_default_writing_model_id = Column(Integer, ForeignKey("openrouter_model.id"))
    ai_default_writing_model = relationship(
        "OpenRouterModelModel", foreign_keys=[ai_default_writing_model_id]
    )

    ai_autocomplete_model_id = Column(Integer, ForeignKey("openrouter_model.id"))
    ai_autocomplete_model = relationship(
        "OpenRouterModelModel", foreign_keys=[ai_autocomplete_model_id]
    )

    # chatbox settings
    show_chatbox = Column(Boolean, default=False)
    chatbox_model_id = Column(Integer, ForeignKey("openrouter_model.id"))
    chatbox_model = relationship(
        "OpenRouterModelModel", foreign_keys=[chatbox_model_id]
    )

    # custom code settings
    website_custom_code = Column(Text, nullable=True)

    # theme settings
    selected_theme = Column(String(255), nullable=True)

    _openrouter_api_key = Column("openrouter_api_key", String(255))

    # region openrouter api key
    @property
    def openrouter_api_key(self):
        """Decrypt and return the secret key."""
        if self._openrouter_api_key:
            try:
                return _decrypt(self._openrouter_api_key, settings.APP_SECRET).decode(
                    "utf-8"
                )
            except Exception as e:
                logger.error(f"Failed to decrypt Openrouter api key: {e}")
                # If decryption fails, return None or handle gracefully
                return None
        return None

    @openrouter_api_key.setter
    def openrouter_api_key(self, value):
        """Encrypt and store the secret key."""
        if value:
            self._openrouter_api_key = _encrypt(value, settings.APP_SECRET)
        else:
            self._openrouter_api_key = None

    @classmethod
    def find_organization_by_domain(cls, domain: str, db: Session):
        """Find organization by domain, fallback to wildcard (*) if not found"""
        # First try exact domain match
        organizations = db.query(cls).all()
        for org in organizations:
            if org.domains and domain in org.domains:
                return org

        # Fallback to wildcard organization
        for org in organizations:
            if org.domains and "*" in org.domains:
                return org

        # If no wildcard found, return first organization
        fallback_org = organizations[0] if organizations else None
        return fallback_org

    @classmethod
    def get_public_settings(
        cls,
        organization_id: int,
        db: Session,
        lang: str = None,
    ):
        from deepsel.utils.models_pool import models_pool
        from deepsel.apps.cms.utils.process_menu_item import (
            build_localized_menus,
            LocalizedMenuItem,
        )

        # Call the parent class method to get the base public settings
        public_settings = super().get_public_settings(organization_id, db)

        # Get the organization to access our extended fields
        organization = db.query(cls).get(organization_id)
        if not organization:
            return public_settings

        # Use provided lang or fall back to default language
        # Treat 'default' as unset — callers may pass it as a placeholder
        effective_lang = lang if lang and lang != "default" else None
        target_lang = effective_lang or (
            organization.default_language.iso_code
            if organization.default_language
            else None
        )

        # Get only root level menu items (parent_id is None) ordered by position
        MenuModel = models_pool["menu"]
        root_menus = (
            db.query(MenuModel)
            .filter(MenuModel.parent_id == None)
            .filter(MenuModel.organization_id == organization_id)
            .order_by(MenuModel.position)
            .all()
        )
        # Process menu items with all translations
        localized_menus: list[LocalizedMenuItem] = [
            menu for menu in build_localized_menus(root_menus, target_lang, db)
        ]

        # Compute theme_key: if this org has any theme_file overlay rows for
        # selected_theme, point at the per-org themeMap entry; otherwise use
        # the base theme name. The client falls back gracefully when an
        # overlay is announced but not yet generated.
        ThemeFileModel = models_pool.get("theme_file")
        theme_key = organization.selected_theme
        if ThemeFileModel is not None and organization.selected_theme:
            has_overlay = (
                db.query(ThemeFileModel.id)
                .filter(
                    ThemeFileModel.organization_id == organization_id,
                    ThemeFileModel.theme_name == organization.selected_theme,
                )
                .first()
                is not None
            )
            if has_overlay:
                theme_key = f"{organization.selected_theme}__{organization_id}"

        # Add our extended fields to the public settings
        public_settings.update(
            {
                "domains": organization.domains,
                "available_languages": organization.available_languages,
                "default_language": (
                    {
                        "id": organization.default_language.id,
                        "name": organization.default_language.name,
                        "iso_code": organization.default_language.iso_code,
                    }
                    if organization.default_language
                    else None
                ),
                "auto_translate_pages": organization.auto_translate_pages,
                "auto_translate_posts": organization.auto_translate_posts,
                "auto_translate_components": organization.auto_translate_components,
                # Don't expose API keys in public settings
                "has_openai_api_key": bool(organization.openai_api_key),
                "has_openrouter_api_key": bool(organization.openrouter_api_key),
                "ai_autocomplete_model_id": organization.ai_autocomplete_model_id,
                "ai_default_writing_model_id": organization.ai_default_writing_model_id,
                # Post settings
                "show_post_author": organization.show_post_author,
                "show_post_date": organization.show_post_date,
                # Chatbox setting
                "show_chatbox": organization.show_chatbox,
                # Custom code setting
                "website_custom_code": organization.website_custom_code,
                # Theme setting
                "selected_theme": organization.selected_theme,
                "theme_key": theme_key,
                # React components with compiled code for the specified language
                # Always include menus in public settings (localized by backend)
                "menus": [menu.model_dump() for menu in localized_menus],
            }
        )

        return public_settings
