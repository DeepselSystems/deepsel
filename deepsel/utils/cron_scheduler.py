import asyncio
import logging
from contextlib import suppress
from datetime import datetime, UTC

from sqlalchemy import or_

logger = logging.getLogger(__name__)


class CronScheduler:
    def __init__(self, db_session_factory, poll_interval: int = 30):
        self._db_session_factory = db_session_factory
        self._poll_interval = poll_interval
        self._stop_event = asyncio.Event()
        self._task = None

    def start(self):
        self._task = asyncio.create_task(self._run())
        logger.info("Cron scheduler started (poll every %ds)", self._poll_interval)

    async def stop(self):
        if self._task is None:
            return
        self._stop_event.set()
        with suppress(asyncio.TimeoutError):
            await asyncio.wait_for(self._task, timeout=5)
        if not self._task.done():
            self._task.cancel()
            with suppress(asyncio.CancelledError):
                await self._task
        logger.info("Cron scheduler stopped")

    async def _run(self):
        while not self._stop_event.is_set():
            try:
                await self._tick()
            except Exception:
                logger.exception("Cron scheduler tick failed")
            with suppress(TimeoutError):
                await asyncio.wait_for(self._stop_event.wait(), self._poll_interval)

    async def _tick(self):
        from deepsel.utils.models_pool import models_pool

        CronModel = models_pool.get("cron")
        if CronModel is None:
            return

        now = datetime.now(UTC).replace(tzinfo=None)

        with self._db_session_factory() as db:
            due = (
                db.query(CronModel)
                .filter(
                    CronModel.enabled == True,
                    or_(CronModel.next_run == None, CronModel.next_run <= now),
                )
                .with_for_update(skip_locked=True)
                .all()
            )
            for cron in due:
                cron.advance(db)

        for cron in due:
            with self._db_session_factory() as db:
                db.add(cron)
                try:
                    await cron.execute(db)
                    logger.info("Cron job '%s' completed", cron.name)
                except Exception:
                    logger.exception("Cron job '%s' failed", cron.name)
