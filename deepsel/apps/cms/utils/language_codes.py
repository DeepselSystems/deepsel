"""Utility for getting valid language codes from the database."""

import logging
from deepsel.deps import get_db_context
from deepsel.utils.models_pool import models_pool
from traceback import format_exc

logger = logging.getLogger(__name__)


def get_valid_language_codes():
    """
    Get valid language codes from the locale table in the database.
    Returns a set of ISO codes.
    """
    try:
        LocaleModel = models_pool["locale"]

        if not LocaleModel:
            logger.warning("LocaleModel not available yet")
            return set()

        with get_db_context() as db:
            locales = (
                db.query(LocaleModel).filter(LocaleModel.iso_code.isnot(None)).all()
            )

            return {locale.iso_code for locale in locales if locale.iso_code}
    except Exception:
        logger.error(f"Could not query locale table: {format_exc()}")
        # Return empty set if table doesn't exist yet
        return set()
