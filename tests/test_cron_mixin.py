import asyncio
from datetime import timedelta
from unittest.mock import MagicMock

import pytest

# NOTE: import deepsel.utils first to avoid a circular-import error during
# isolated collection (known package import-order quirk).
from deepsel.utils.models_pool import models_pool  # noqa: F401

from deepsel.orm.cron_mixin import CronMixin, UnitInterval


def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


# Records every dispatch so tests can assert how the mixin invoked the method.
CALLS = []


class StubModel:
    @staticmethod
    def sync_method(model, db, *args):
        CALLS.append(("sync", model, db, args))
        return "sync-result"

    @staticmethod
    async def async_method(model, db, *args):
        CALLS.append(("async", model, db, args))
        return "async-result"


class FakeCron(CronMixin):
    def __init__(
        self,
        method="sync_method",
        arguments="[]",
        interval=1,
        interval_unit=UnitInterval.days,
    ):
        self.model = "stub"
        self.method = method
        self.arguments = arguments
        self.interval = interval
        self.interval_unit = interval_unit
        self.name = "test-cron"
        self.last_run = None
        self.next_run = None


@pytest.fixture(autouse=True)
def register_stub(monkeypatch):
    CALLS.clear()
    from deepsel.utils import models_pool as mp

    monkeypatch.setitem(mp.models_pool, "stub", StubModel)
    yield
    CALLS.clear()


class TestDispatch:
    def test_sync_dispatch(self):
        cron = FakeCron(method="sync_method")
        db = MagicMock()
        result = _run(cron.execute(db))
        assert result == "sync-result"
        assert CALLS[0][0] == "sync"

    def test_async_dispatch(self):
        cron = FakeCron(method="async_method")
        db = MagicMock()
        result = _run(cron.execute(db))
        assert result == "async-result"
        assert CALLS[0][0] == "async"

    def test_arguments_parsed_and_prefixed(self):
        cron = FakeCron(method="sync_method", arguments="[1, 'two', 3]")
        db = MagicMock()
        _run(cron.execute(db))
        kind, model, passed_db, args = CALLS[0]
        assert model is StubModel
        assert passed_db is db
        assert args == (1, "two", 3)

    def test_commit_and_refresh_called(self):
        cron = FakeCron()
        db = MagicMock()
        _run(cron.execute(db))
        db.commit.assert_called_once()
        db.refresh.assert_called_once_with(cron)


class TestNextRunMath:
    @pytest.mark.parametrize(
        "unit,interval,expected",
        [
            (UnitInterval.minutes, 30, timedelta(minutes=30)),
            (UnitInterval.hours, 2, timedelta(hours=2)),
            (UnitInterval.days, 3, timedelta(days=3)),
            (UnitInterval.weeks, 1, timedelta(weeks=1)),
            (UnitInterval.months, 2, timedelta(days=60)),
            (UnitInterval.years, 1, timedelta(days=365)),
        ],
    )
    def test_next_run_delta(self, unit, interval, expected):
        cron = FakeCron(interval=interval, interval_unit=unit)
        db = MagicMock()
        _run(cron.execute(db))
        assert cron.last_run is not None
        assert cron.next_run - cron.last_run == expected
