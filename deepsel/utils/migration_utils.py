import asyncio
import logging
from functools import wraps

logger = logging.getLogger(__name__)


def migration_task(task_title: str, target_version: str):
    """
    Simple migration task decorator that supports both sync and async functions.
    Task only runs if (from_version != to_version) and  (to_version == target_version)
    Otherwise just logs that task was skipped.

    Args:
        task_title: Description of task.
        target_version: Version that this task applies to
    """

    def __should_run_migration(from_version: str, to_version: str) -> bool:
        """
        Check if migration should run based on version comparison.
        """
        # Only run if having version change
        if from_version != to_version:
            # Only run if upgrading to the exact target version
            if to_version == target_version:
                logger.info(
                    f"Running migration task: {task_title} (version {target_version})"
                )
                return True
        return False

    def decorator(func):
        if asyncio.iscoroutinefunction(func):
            # Handle async functions
            @wraps(func)
            async def async_wrapper(
                db, app_name, from_version, to_version, *args, **kwargs
            ):
                if __should_run_migration(from_version, to_version):
                    return await func(
                        db, app_name, from_version, to_version, *args, **kwargs
                    )

            return async_wrapper
        else:
            # Handle sync functions
            @wraps(func)
            def sync_wrapper(db, app_name, from_version, to_version, *args, **kwargs):
                if __should_run_migration(from_version, to_version):
                    return func(db, app_name, from_version, to_version, *args, **kwargs)

            return sync_wrapper

    return decorator
