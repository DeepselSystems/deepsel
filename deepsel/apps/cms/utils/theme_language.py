"""Utility for managing language-specific theme folders."""

import os
import shutil
import logging

logger = logging.getLogger(__name__)


def ensure_language_theme_exists(
    lang_code: str, theme_name: str, data_dir_path: str
) -> str:
    """
    Ensure language theme folder exists by cloning from default theme if needed.
    This is the single source of truth for language theme creation.

    Args:
        lang_code: Language code (e.g., 'de', 'fr')
        theme_name: Theme name (e.g., 'starter_react', 'darkmode')
        data_dir_path: Path to data dir directory

    Returns:
        Path to the language theme directory
    """
    lang_theme_dir = os.path.join(data_dir_path, "themes", lang_code, theme_name)

    # Clone entire theme to lang folder if it doesn't exist
    if not os.path.exists(lang_theme_dir):
        default_theme_path = os.path.join(data_dir_path, "themes", theme_name)
        logger.info(f"Cloning theme from {default_theme_path} to {lang_theme_dir}")

        if os.path.exists(default_theme_path):
            shutil.copytree(default_theme_path, lang_theme_dir)
        else:
            logger.warning(f"Default theme path not found: {default_theme_path}")
            # Create directory structure anyway
            os.makedirs(lang_theme_dir, exist_ok=True)

    return lang_theme_dir
