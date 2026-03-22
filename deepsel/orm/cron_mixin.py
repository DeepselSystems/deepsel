import enum
import inspect
import logging
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

    async def execute(self, db: Session):
        from deepsel.utils.models_pool import models_pool

        self.last_run = datetime.now(UTC)

        model = models_pool.get(self.model, None)
        method = getattr(model, self.method)
        is_async = inspect.iscoroutinefunction(method)
        arguments = literal_eval(self.arguments)
        arguments = [model, db] + arguments

        if is_async:
            result = await method(*arguments)
        else:
            result = method(*arguments)

        if self.interval_unit.value in ["months", "years"]:
            if self.interval_unit.value == "years":
                delta = timedelta(days=365 * self.interval)
            else:
                delta = timedelta(days=30 * self.interval)
        else:
            delta = timedelta(**{self.interval_unit.value: self.interval})
        self.next_run = self.last_run + delta
        db.commit()
        db.refresh(self)

        return result

    def test_run(self, db: Session):
        logger.info(
            f"Executed successfully cron {self.name} with model {self.model} "
            f"and method {self.method} with arguments {self.arguments}"
        )
