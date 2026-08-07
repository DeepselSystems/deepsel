import pytest

from deepsel.utils.models_pool import models_pool, set_models_pool


@pytest.fixture(autouse=True)
def clean_pool():
    """Reset models_pool to empty for each test, then restore whatever was
    there before.

    models_pool is a shared global (see deepsel/apps/conftest.py, which
    registers the real core+cms models into it once for the whole session) —
    leaving it wiped to {} after this file's last test silently breaks any
    test that runs later in the same session and expects those real model
    registrations to still be there.
    """
    old_pool = dict(models_pool)
    set_models_pool({})
    yield
    set_models_pool(old_pool)


def test_models_pool_initially_empty():
    assert models_pool == {}


def test_set_models_pool_populates():
    set_models_pool({"users": "FakeUserModel", "orders": "FakeOrderModel"})
    assert models_pool == {"users": "FakeUserModel", "orders": "FakeOrderModel"}


def test_set_models_pool_clears_previous():
    set_models_pool({"users": "OldModel"})
    set_models_pool({"products": "NewModel"})
    assert "users" not in models_pool
    assert models_pool == {"products": "NewModel"}


def test_set_models_pool_with_empty_dict():
    set_models_pool({"users": "Model"})
    set_models_pool({})
    assert models_pool == {}


def test_models_pool_is_shared_reference():
    """The global dict object is shared across imports."""
    set_models_pool({"table": "Model"})
    from deepsel.utils.models_pool import models_pool as pool2

    assert pool2 is models_pool
    assert pool2["table"] == "Model"
