"""Test bootstrap for packaged deepsel apps (cms, ...).

Apps shipped inside the deepsel package (e.g. ``deepsel.apps.cms``) are designed
to be installed by a *consuming* project that provides:

  * a SQLAlchemy declarative ``Base`` and FastAPI deps, injected via
    ``deepsel.deps.configure_deps``; and
  * concrete "core" models (``user``, ``organization``, ``locale``, ...)
    registered in ``deepsel.utils.models_pool.models_pool``.

The app's modules read those at *import* time (e.g.
``deepsel/apps/cms/__init__.py`` imports ``CMSSettingsModel`` which subclasses
``models_pool["organization"]``). So before pytest can even import a test module
living inside ``deepsel/apps/cms``, the bootstrap below must have run.

This conftest sits above every app's tests, so pytest imports it first — it
stands up a minimal version of what a consumer would provide. It is intentionally
not a full core app; tests that need more should register additional models.
"""

from types import SimpleNamespace

from sqlalchemy import Column, Integer, String
from sqlalchemy.orm import declarative_base

# Import from deepsel.utils first to fully initialize the package before
# deepsel.orm, avoiding a known package-level circular import between
# deepsel.orm and deepsel.utils.crud_router.
from deepsel.utils.models_pool import models_pool
from deepsel.deps import configure_deps
from deepsel.orm.mixin import ORMBaseMixin

# Shared declarative base for the app test harness — this is the base the
# packaged app models bind to (via ``from deepsel.deps import Base``).
Base = declarative_base()


# --- Minimal "core" models a consumer would normally provide ---------------


class OrganizationModel(Base, ORMBaseMixin):
    __tablename__ = "organization"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100))
    current_version = Column(String(50))


class UserModel(Base, ORMBaseMixin):
    __tablename__ = "user"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String, unique=True)
    email = Column(String, unique=True, nullable=False)


class LocaleModel(Base, ORMBaseMixin):
    __tablename__ = "locale"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    iso_code = Column(String, nullable=False)
    emoji_flag = Column(String)


class OpenRouterModelModel(Base, ORMBaseMixin):
    """Stand-in for the cms ``openrouter_model`` so relationships on
    ``CMSSettingsModel`` resolve during mapper configuration."""

    __tablename__ = "openrouter_model"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String)


_CORE_MODELS = {
    OrganizationModel.__tablename__: OrganizationModel,
    UserModel.__tablename__: UserModel,
    LocaleModel.__tablename__: LocaleModel,
    OpenRouterModelModel.__tablename__: OpenRouterModelModel,
}

# Register before any app package is imported so its models can resolve these.
models_pool.update(_CORE_MODELS)


# Minimal settings object the app reads via ``deepsel.deps.settings``. Real
# values are only needed by code paths the current tests don't exercise.
_test_settings = SimpleNamespace(
    APP_SECRET="test-app-secret",  # nosec B106
    backend_dir=None,
)


def _noop_dep():  # pragma: no cover - placeholder dependency
    yield None


configure_deps(
    base=Base,
    get_db_func=_noop_dep,
    get_db_context_func=_noop_dep,
    settings_obj=_test_settings,
)
