"""Server lifecycle event handlers for startup and shutdown.

Runs version upgrade checks for each installed app on startup by comparing
the database-stored version against the source version, invoking each app's
upgrade() function when available.
"""

import logging
import importlib
from sqlalchemy.orm import Session
from typing import Callable
from deepsel.utils.models_pool import AppModule

logger = logging.getLogger(__name__)


def on_startup(
    *,
    db: Session,
    app_modules: list[AppModule],
    src_version: str,
    current_version: str,
    set_version: Callable,
):
    """Run version upgrade checks for each installed app on startup.

    Args:
        db: Active SQLAlchemy session.
        app_modules: List of app modules to upgrade.
        src_version: The source code version to upgrade to.
        current_version: The version currently stored in the database.
        set_version: A callable(db, version) that persists the new version.
    """
    logger.info("Server is starting...")
    try:
        for _, module_prefix in app_modules:
            try:
                app_module = importlib.import_module(module_prefix)
                if hasattr(app_module, "upgrade"):
                    app_module.upgrade(db, current_version, src_version)
            except Exception as e:
                logger.error(f"Error upgrading {module_prefix}: {e}")
        set_version(db, src_version)
        db.commit()
    except Exception as e:
        logger.error(f"On startup failed: {e}")


def on_shutdown():
    logger.info("Server has shutdown.")
