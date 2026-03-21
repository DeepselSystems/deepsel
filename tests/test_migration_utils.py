import asyncio

from deepsel.utils.migration_utils import migration_task


def _run(coro):
    """Helper to run async functions in sync tests."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def test_sync_runs_when_version_matches():
    calls = []

    @migration_task("test task", "2.0")
    def upgrade(db, app_name, from_version, to_version):
        calls.append((from_version, to_version))
        return "done"

    result = upgrade(None, "myapp", "1.0", "2.0")
    assert calls == [("1.0", "2.0")]
    assert result == "done"


def test_sync_skips_when_same_version():
    calls = []

    @migration_task("test task", "2.0")
    def upgrade(db, app_name, from_version, to_version):
        calls.append(True)

    result = upgrade(None, "myapp", "1.0", "1.0")
    assert calls == []
    assert result is None


def test_sync_skips_when_to_version_not_target():
    calls = []

    @migration_task("test task", "2.0")
    def upgrade(db, app_name, from_version, to_version):
        calls.append(True)

    result = upgrade(None, "myapp", "1.0", "3.0")
    assert calls == []
    assert result is None


def test_async_runs_when_version_matches():
    calls = []

    @migration_task("async task", "2.0")
    async def upgrade(db, app_name, from_version, to_version):
        calls.append((from_version, to_version))
        return "async_done"

    result = _run(upgrade(None, "myapp", "1.0", "2.0"))
    assert calls == [("1.0", "2.0")]
    assert result == "async_done"


def test_async_skips_when_same_version():
    calls = []

    @migration_task("async task", "2.0")
    async def upgrade(db, app_name, from_version, to_version):
        calls.append(True)

    result = _run(upgrade(None, "myapp", "1.0", "1.0"))
    assert calls == []
    assert result is None


def test_wraps_preserves_function_name():
    @migration_task("task", "1.0")
    def my_upgrade(db, app_name, from_version, to_version):
        pass

    assert my_upgrade.__name__ == "my_upgrade"


def test_wraps_preserves_async_function_name():
    @migration_task("task", "1.0")
    async def my_async_upgrade(db, app_name, from_version, to_version):
        pass

    assert my_async_upgrade.__name__ == "my_async_upgrade"


def test_passes_extra_args_kwargs():
    received = {}

    @migration_task("task", "2.0")
    def upgrade(db, app_name, from_version, to_version, *args, **kwargs):
        received["args"] = args
        received["kwargs"] = kwargs

    upgrade(None, "myapp", "1.0", "2.0", "extra_arg", key="value")
    assert received["args"] == ("extra_arg",)
    assert received["kwargs"] == {"key": "value"}
