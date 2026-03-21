"""Server lifecycle event handlers for startup and shutdown.

Runs version upgrade checks for each installed app on startup by comparing
the database-stored version against the source version, invoking each app's
upgrade() function when available.
"""

import logging
import importlib

logger = logging.getLogger(__name__)


def on_startup(db, app_names, src_version, current_version, set_version):
    """Run version upgrade checks for each installed app on startup.

    Args:
        db: Active SQLAlchemy session.
        app_names: List of installed app names (e.g. ["core", "locales", "cms"]).
        src_version: The source code version to upgrade to.
        current_version: The version currently stored in the database.
        set_version: A callable(db, version) that persists the new version.
    """
    logger.info("Server is starting...")
    try:
        for app_name in app_names:
            try:
                app_module = importlib.import_module(f"apps.{app_name}")
                if hasattr(app_module, "upgrade"):
                    app_module.upgrade(db, current_version, src_version)
            except Exception as e:
                logger.error(f"Error upgrading {app_name}: {e}")
        set_version(db, src_version)
        db.commit()
    except Exception as e:
        logger.error(f"On startup failed: {e}")


def on_shutdown():
    logger.info("Server has shutdown.")
