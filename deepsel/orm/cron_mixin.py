import asyncio
import enum
import inspect
import logging
import traceback
from ast import literal_eval
from datetime import datetime, timedelta, UTC

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


class UnitInterval(enum.Enum):
    minutes = "minutes"
    hours = "hours"
    days = "days"
    weeks = "weeks"
    months = "months"
    years = "years"


class CronMixin:
    """
    Mixin providing scheduled task execution via models_pool dynamic dispatch.

    Expects model to have: model, method, arguments, last_run, next_run,
                           interval, interval_unit, name attributes.
    """

    def _compute_delta(self) -> timedelta:
        unit = self.interval_unit.value
        if unit == "years":
            return timedelta(days=365 * self.interval)
        elif unit == "months":
            return timedelta(days=30 * self.interval)
        return timedelta(**{unit: self.interval})

    def advance(self, db: Session):
        now = datetime.now(UTC).replace(tzinfo=None)
        self.last_run = now
        self.next_run = now + self._compute_delta()
        db.commit()

    async def execute(self, db: Session):
        from deepsel.utils.models_pool import models_pool

        model = models_pool.get(self.model, None)
        if model is None:
            self.last_status = "error"
            self.last_error = f"model '{self.model}' not found in models_pool"
            db.commit()
            return

        method = getattr(model, self.method, None)
        if method is None:
            self.last_status = "error"
            self.last_error = f"method '{self.method}' not found on {self.model}"
            db.commit()
            return

        arguments = literal_eval(self.arguments) if self.arguments else []
        arguments = [model, db] + arguments

        try:
            if inspect.iscoroutinefunction(method):
                result = await method(*arguments)
            else:
                result = await asyncio.to_thread(method, *arguments)
            self.last_status = "success"
            self.last_error = None
            db.commit()
            return result
        except Exception:
            logger.exception("Cron job '%s' (%s.%s) failed", self.name, self.model, self.method)
            self.last_status = "error"
            self.last_error = traceback.format_exc()[-500:]
            db.commit()

    def test_run(self, db: Session):
        logger.info(
            f"Executed successfully cron {self.name} with model {self.model} "
            f"and method {self.method} with arguments {self.arguments}"
        )
