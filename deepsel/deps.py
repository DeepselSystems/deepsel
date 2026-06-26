from typing import Callable
from sqlalchemy.orm.decl_api import DeclarativeMeta
from types import ModuleType

Base: DeclarativeMeta | None = None
get_db: Callable | None = None
get_db_context: Callable | None = None
settings: ModuleType | None = None


def configure_deps(
    *,
    base: DeclarativeMeta,
    get_db_func: Callable,
    get_db_context_func: Callable,
    settings_obj: ModuleType | None = None,
) -> None:
    """
    Configure consumer dependencies for the deepsel package.
    Called from consumer apps to inject:
    - SQLAlchemy declarative base, for models defined in this package
    - FastAPI dependency functions, for routers defined in this package:
        - get_db
        - get_db_context

    Args:
        base: The SQLAlchemy declarative base class for models defined in this package.
        get_db_func: The database dependency function.
        get_db_context_func: The database context dependency function.
        settings_obj: The consumer's settings module. The built-in auth dependencies
            read APP_SECRET, AUTH_ALGORITHM, DEFAULT_ORG_ID, AUTHLESS and
            SESSION_COOKIE_NAME from it.
    """
    global Base
    global get_db
    global get_db_context
    global settings

    Base = base
    get_db = get_db_func
    get_db_context = get_db_context_func
    settings = settings_obj
