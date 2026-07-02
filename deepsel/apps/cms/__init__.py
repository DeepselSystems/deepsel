import logging
import asyncio
import os
from sqlalchemy import text as sa_text
from deepsel.utils.models_pool import models_pool
from deepsel.utils import migration_task
from deepsel.deps import settings
from deepsel.utils.crypto import encrypt as _encrypt, decrypt as _decrypt
from .models.organization import CMSSettingsModel

logger = logging.getLogger(__name__)


def _get_project_root() -> str:
    """Resolve the consuming project's repo root (where client/ and themes/ live).

    The cms app now ships inside the installed ``deepsel`` package, so the old
    ``__file__``-relative resolution would point at the deepsel package instead
    of the project being served. Derive it from the active settings module's
    ``backend_dir`` (``.../<project>/backend``) → its parent is the repo root.
    """
    backend_dir = getattr(settings, "backend_dir", None)
    if backend_dir is not None:
        return os.path.normpath(
            str(
                backend_dir.parent
                if hasattr(backend_dir, "parent")
                else os.path.join(str(backend_dir), "..")
            )
        )
    return os.path.normpath(os.path.join(os.getcwd(), ".."))


# async def demo_running_background_task(db):
#     logger.info("Demo running background task when upgrade app.")


async def run_cron_fetch_openrouter_model(db):
    OpenRouterModelModel = models_pool["openrouter_model"]
    OpenRouterModelModel().cron_fetch_openrouter_model(db)
    logger.info("Fetched openrouter models successfully.")


async def set_default_locale_if_empty(db):
    """Set default locale to en_US if not already set"""
    # logger.info("Checking and setting default locale if needed")
    try:
        LocaleModel = models_pool["locale"]

        # Get all organizations that don't have a default language set
        orgs_without_default = (
            db.query(CMSSettingsModel)
            .filter(CMSSettingsModel.default_language_id == None)  # noqa: E711
            .all()
        )

        if orgs_without_default:
            # Find the en_US locale
            en_us_locale = (
                db.query(LocaleModel).filter(LocaleModel.string_id == "en_US").first()
            )

            if not en_us_locale:
                logger.warning("en_US locale not found in the database")
                return

            # logger.info(f"Found en_US locale with ID: {en_us_locale.id}")

            # Update all organizations without a default language
            for org in orgs_without_default:
                logger.info(f"Setting default locale for organization ID: {org.id}")
                org.default_language_id = en_us_locale.id

                # If available_languages is empty, add en_US to it
                if not org.available_languages:
                    org.available_languages = [
                        {
                            "id": en_us_locale.id,
                            "name": "English / English",
                            "iso_code": "en",
                        }
                    ]
                elif en_us_locale.id not in org.available_languages:
                    org.available_languages.append(
                        {
                            "id": en_us_locale.id,
                            "name": "English / English",
                            "iso_code": "en",
                        }
                    )

                # logger.info(org.available_languages)

            # Commit the changes
            db.commit()
            logger.info("Default locale set successfully")
    except Exception as e:
        logger.error(f"Error setting default locale: {e}")
        db.rollback()


@migration_task("Migration encrypts CMS API keys", "1.0.4")
def _migrate_cms_api_keys_to_encrypted_value(db, *args, **kwargs):
    """
    Encrypts CMS API keys that are stored as plain text in the database.
    This migration enhances security by encrypting sensitive API keys for CMS
    settings. Processes all organizations in the database.

    Encrypted API Keys:
        - OpenRouter API key (if not already encrypted)
    """
    # Create the logger
    internal_logger = logging.getLogger(
        f"{__name__}:{_migrate_cms_api_keys_to_encrypted_value.__name__}"
    )

    try:
        # Query all CMS settings organizations
        all_cms_settings = db.query(CMSSettingsModel).all()

        if not all_cms_settings:
            internal_logger.info("No CMS settings found. Skipping migration.")
            return

        internal_logger.info(f"Found {len(all_cms_settings)} CMS settings to process")

        # Process each organization
        for cms_settings in all_cms_settings:
            internal_logger.info(f"Processing organization ID: {cms_settings.id}")

            # Handle encrypting OpenRouter API key (if not already encrypted)
            # Check if the attribute exists and has data
            if (
                hasattr(cms_settings, "_openrouter_api_key")
                and cms_settings._openrouter_api_key
            ):
                try:
                    # Check if it's already encrypted by trying to decrypt it
                    try:
                        _decrypt(cms_settings._openrouter_api_key, settings.APP_SECRET)
                        internal_logger.info(
                            f"OpenRouter API key for org {cms_settings.id} is already encrypted"
                        )
                    except (ValueError, Exception):
                        # If decryption fails, it means it's plain text, so encrypt it
                        cms_settings._openrouter_api_key = _encrypt(
                            cms_settings._openrouter_api_key, settings.APP_SECRET
                        )
                        internal_logger.info(
                            f"Encrypted 'OpenRouter API key' for org {cms_settings.id} successfully"
                        )
                except Exception as e:
                    internal_logger.error(
                        f"Migration failed to encrypt 'OpenRouter API key' for org {cms_settings.id} - {e}"
                    )

        # Commit all changes
        db.commit()

        # Log the result
        internal_logger.info("CMS API keys migration completed successfully.")

    except Exception as e:
        internal_logger.error(f"CMS API keys migration failed with error: {e}")
        db.rollback()
        raise


async def set_default_ai_models(db):
    """Set default AI models on organizations if not already set."""
    # logger.info("Checking and setting default AI models if needed")
    try:
        OpenRouterModelModel = models_pool["openrouter_model"]

        defaults = {
            "ai_translation_model_id": "google/gemini-2.0-flash-lite",
            "ai_default_writing_model_id": "google/gemini-2.5-pro",
            "ai_autocomplete_model_id": "google/gemini-2.0-flash-lite",
            "chatbox_model_id": "anthropic/claude-sonnet-4.6",
        }

        # Resolve string_ids to actual model IDs
        resolved = {}
        for field, string_id in defaults.items():
            model = (
                db.query(OpenRouterModelModel)
                .filter(OpenRouterModelModel.string_id == string_id)
                .first()
            )
            if model:
                resolved[field] = model.id
            else:
                logger.warning(
                    f"OpenRouter model '{string_id}' not found, skipping {field}"
                )

        if not resolved:
            return

        for org in db.query(CMSSettingsModel).all():
            updated = False
            for field, model_id in resolved.items():
                if not getattr(org, field, None):
                    setattr(org, field, model_id)
                    updated = True
            if updated:
                logger.info(f"Set default AI models for organization {org.id}")

        db.commit()
    except Exception as e:
        logger.error(f"Error setting default AI models: {e}")
        db.rollback()


async def set_default_domains(db):
    for org in db.query(CMSSettingsModel).all():
        if not org.domains:
            org.domains = ["*"]
            db.commit()


def set_default_theme_if_empty(db):
    """Set default theme to paper if not already set, and load its seed data."""
    # logger.info("Checking and setting default theme if needed")
    try:
        orgs_without_theme = (
            db.query(CMSSettingsModel)
            .filter(CMSSettingsModel.selected_theme == None)  # noqa: E711
            .all()
        )

        if orgs_without_theme:
            for org in orgs_without_theme:
                logger.info(f"Setting default theme for organization ID: {org.id}")
                org.selected_theme = "paper"

            db.commit()

            from .utils.setup_themes import load_seed_data_for_theme

            load_seed_data_for_theme("paper", db, organization_id=1)
            logger.info("Default theme set successfully")
    except Exception as e:
        logger.error(f"Error setting default theme: {e}")
        db.rollback()


@migration_task("Add full-text search vectors to content tables", "1.0.6")
def _migrate_add_search_vectors(db, *args, **kwargs):
    """Enable pg_trgm and backfill search_vector columns for FTS."""
    _logger = logging.getLogger(f"{__name__}:{_migrate_add_search_vectors.__name__}")

    try:
        db.execute(sa_text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))

        # Backfill page_content search vectors
        db.execute(sa_text("""
                UPDATE page_content
                SET search_vector =
                    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
                    setweight(to_tsvector('simple', coalesce(
                        regexp_replace(coalesce(content, ''), '<[^>]+>', ' ', 'g'),
                    '')), 'B')
            """))

        # Backfill blog_post_content search vectors
        db.execute(sa_text("""
                UPDATE blog_post_content
                SET search_vector =
                    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
                    setweight(to_tsvector('simple', coalesce(
                        regexp_replace(coalesce(content, ''), '<[^>]+>', ' ', 'g'),
                    '')), 'B')
            """))

        db.commit()
        _logger.info("Search vectors backfilled successfully.")
    except Exception as e:
        _logger.error(f"Failed to backfill search vectors: {e}")
        db.rollback()
        raise


@migration_task("Encrypt org mail_password and google_client_secret", "1.0.7")
def _migrate_encrypt_org_secrets(db, *args, **kwargs):
    """Encrypt plaintext mail_password and google_client_secret in organization table."""
    _logger = logging.getLogger(f"{__name__}:{_migrate_encrypt_org_secrets.__name__}")

    try:
        OrganizationModel = models_pool["organization"]

        all_orgs = db.query(OrganizationModel).all()
        if not all_orgs:
            _logger.info("No organizations found. Skipping.")
            return

        for org in all_orgs:
            # mail_password: try decrypt — if it fails, it's plaintext, so re-set via property
            if org._mail_password:
                try:
                    _decrypt(org._mail_password, settings.APP_SECRET)
                    _logger.info(f"Org {org.id} mail_password already encrypted")
                except Exception:
                    org.mail_password = org._mail_password  # setter encrypts
                    _logger.info(f"Encrypted mail_password for org {org.id}")

            # google_client_secret
            if org._google_client_secret:
                try:
                    _decrypt(org._google_client_secret, settings.APP_SECRET)
                    _logger.info(f"Org {org.id} google_client_secret already encrypted")
                except Exception:
                    org.google_client_secret = (
                        org._google_client_secret
                    )  # setter encrypts
                    _logger.info(f"Encrypted google_client_secret for org {org.id}")

        db.commit()
        _logger.info("Org secrets encryption migration completed.")
    except Exception as e:
        _logger.error(f"Org secrets migration failed: {e}")
        db.rollback()
        raise


@migration_task("Prepend / to blog post slugs for consistency with pages", "1.0.8")
def _migrate_blog_post_slugs_prepend_slash(db, *args, **kwargs):
    """Backfill leading / on existing blog post slugs so they match the page pattern."""
    _logger = logging.getLogger(
        f"{__name__}:{_migrate_blog_post_slugs_prepend_slash.__name__}"
    )
    try:
        BlogPostModel = models_pool["blog_post"]
        posts = (
            db.query(BlogPostModel)
            .filter(BlogPostModel.slug.isnot(None))
            .filter(~BlogPostModel.slug.startswith("/"))
            .all()
        )
        _logger.info(f"Backfilling leading / on {len(posts)} blog posts")
        for post in posts:
            post.slug = f"/{post.slug}"
        db.commit()
        _logger.info("Blog post slug migration completed.")
    except Exception as e:
        _logger.error(f"Blog post slug migration failed: {e}")
        db.rollback()
        raise


@migration_task("Reset theme_file for per-org overlay schema", "1.0.10")
def _migrate_reset_theme_file_for_org_scope(db, *args, **kwargs):
    """Drop all theme_file rows so the new (theme_name, file_path, organization_id)
    unique constraint can be enforced cleanly. Pre-existing rows had no org_id
    (the column didn't exist), so there's no way to attribute them; the fresh
    slate was confirmed by the user."""
    _logger = logging.getLogger(
        f"{__name__}:{_migrate_reset_theme_file_for_org_scope.__name__}"
    )
    try:
        db.execute(
            sa_text(
                "TRUNCATE TABLE theme_file_content, theme_file RESTART IDENTITY CASCADE"
            )
        )
        db.commit()
        _logger.info(
            "theme_file and theme_file_content truncated for org-scope migration."
        )
    except Exception as e:
        _logger.error(f"theme_file reset migration failed: {e}")
        db.rollback()
        raise


@migration_task("Backfill per-content published flag from parent", "1.0.9")
def _migrate_backfill_content_published(db, *args, **kwargs):
    """Copy parent.published onto each content row.

    Publish state moved from parent to content. For existing data, mirror
    whatever the parent had. Fresh installs seed content.published directly.
    """
    _logger = logging.getLogger(
        f"{__name__}:{_migrate_backfill_content_published.__name__}"
    )
    try:
        db.execute(sa_text("""
                UPDATE page_content
                SET published = page.published
                FROM page
                WHERE page_content.page_id = page.id
                  AND page_content.published IS DISTINCT FROM page.published
            """))
        db.execute(sa_text("""
                UPDATE blog_post_content
                SET published = blog_post.published
                FROM blog_post
                WHERE blog_post_content.post_id = blog_post.id
                  AND blog_post_content.published IS DISTINCT FROM blog_post.published
            """))
        db.commit()
        _logger.info("Per-content published backfill completed.")
    except Exception as e:
        _logger.error(f"Per-content published backfill failed: {e}")
        db.rollback()
        raise


def upgrade(db, from_version, to_version):
    """Upgrade app from current version in db to version in file settings.py"""
    # logger.info(f"Start upgrade from version {from_version} to {to_version}")

    # Encrypts cms api keys
    _migrate_cms_api_keys_to_encrypted_value(db, __name__, from_version, to_version)

    # Encrypt org secrets (mail_password, google_client_secret)
    _migrate_encrypt_org_secrets(db, __name__, from_version, to_version)

    # Full-text search vectors
    _migrate_add_search_vectors(db, __name__, from_version, to_version)

    # Prepend / to blog post slugs (align with page slug pattern)
    _migrate_blog_post_slugs_prepend_slash(db, __name__, from_version, to_version)

    # Per-content published backfill (publish state moved from parent to content)
    _migrate_backfill_content_published(db, __name__, from_version, to_version)

    # Reset theme_file before reconcile sees the new organization_id column
    _migrate_reset_theme_file_for_org_scope(db, __name__, from_version, to_version)

    # Ensure a theme is selected BEFORE generating imports
    set_default_theme_if_empty(db)

    # Read the selected theme for single-theme imports
    org = db.query(CMSSettingsModel).first()
    selected_theme = org.selected_theme if org else "alcoris"

    # Setup themes
    if settings.NO_CLIENT:
        # Dev mode: reconcile per-org overlays into the repo's themes/ tree
        # (Astro dev imports straight from there), then regenerate theme imports
        # and tailwind config.
        from .utils.theme_imports import (
            generate_theme_imports,
            generate_tailwind_config,
        )
        from .utils.setup_themes import reconcile_theme_overlays

        project_root = _get_project_root()
        reconcile_theme_overlays(project_root, force=True)
        generate_theme_imports(
            data_dir_path=project_root, selected_theme=selected_theme
        )
        generate_tailwind_config(
            data_dir_path=project_root, selected_theme=selected_theme
        )
    else:
        from .utils.setup_themes import setup_themes

        setup_themes(selected_theme=selected_theme)

    # Start the Astro client after themes are built
    from .utils.client_process import get_client_manager

    manager = get_client_manager()
    if manager:
        manager.start()

    # Call background task if need start api server as sooon as possible
    # asyncio.create_task(demo_running_background_task(db))

    # Set default locale if not already set
    asyncio.create_task(set_default_locale_if_empty(db))

    asyncio.create_task(run_cron_fetch_openrouter_model(db))

    asyncio.create_task(set_default_domains(db))

    asyncio.create_task(set_default_ai_models(db))
