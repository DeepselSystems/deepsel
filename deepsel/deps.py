from typing import Callable
from sqlalchemy.orm.decl_api import DeclarativeMeta
from types import ModuleType

Base: DeclarativeMeta | None = None
get_db: Callable | None = None
get_current_user: Callable | None = None
get_current_user_optional: Callable | None = None
get_db_context: Callable | None = None
settings: ModuleType | None = None

def configure_deps(
    *,
    base: DeclarativeMeta,
    get_db_func: Callable,
    get_current_user_func: Callable,
    get_current_user_optional_func: Callable,
    get_db_context_func: Callable,
    settings_obj: ModuleType | None = None,
) -> None:
    """
    Configure consumer dependencies for the deepsel package.
    Called from consumer apps to inject:
    - SQLAlchemy declarative base, for models defined in this package
    - FastAPI dependency functions, for routers defined in this package:
        - get_db
        - get_current_user
        - get_current_user_optional
        - get_db_context
    
    Args:
        base: The SQLAlchemy declarative base class for models defined in this package.
        get_db_func: The database dependency function.
        get_current_user_func: The current user dependency function.
        get_current_user_optional_func: The current user optional dependency function.
        get_db_context_func: The database context dependency function.
    """
    global Base
    global get_db
    global get_current_user
    global get_current_user_optional
    global get_db_context
    global settings

    Base = base
    get_db = get_db_func
    get_current_user = get_current_user_func
    get_current_user_optional = get_current_user_optional_func
    get_db_context = get_db_context_func
    settings = settings_obj
