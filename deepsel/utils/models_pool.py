import importlib
import importlib.util
import inspect
import logging
import os
from pathlib import Path
from typing import Any, TypeAlias

logger = logging.getLogger(__name__)

_DEFAULT_APP_DIRS: list[str] = ["deepsel.apps"]
AppPath: TypeAlias = str | os.PathLike[str]
AppModule: TypeAlias = tuple[str, str]

models_pool: dict[str, Any] = {}


def _module_prefix_from_path(path: str) -> str:
    return path.replace(os.sep, ".").replace("/", ".")


def _resolve_app_dir(
    app_dir: AppPath,
    *,
    base_dir: AppPath | None = None,
) -> AppModule:
    """Resolve a directory identifier to (filesystem_path, module_prefix).

    Accepts either a filesystem path (e.g. "apps") or a dotted import
    path (e.g. "deepsel.apps").
    """
    app_dir_str = os.fspath(app_dir)
    if base_dir is not None:
        base_relative = Path(base_dir) / app_dir_str
        if base_relative.is_dir():
            return str(base_relative), _module_prefix_from_path(app_dir_str)

    if os.path.isdir(app_dir_str):
        return app_dir_str, _module_prefix_from_path(app_dir_str)

    try:
        spec = importlib.util.find_spec(app_dir_str)
    except (ModuleNotFoundError, ValueError):
        spec = None
    if spec is not None and spec.submodule_search_locations:
        return spec.submodule_search_locations[0], app_dir_str

    return app_dir_str, _module_prefix_from_path(app_dir_str)


def _resolve_dotted_app(module_prefix: str) -> AppModule:
    spec = importlib.util.find_spec(module_prefix)
    if spec is None or not spec.submodule_search_locations:
        raise ModuleNotFoundError(
            f"Installed app '{module_prefix}' could not be resolved"
        )
    return spec.submodule_search_locations[0], module_prefix


def resolve_installed_apps(
    *,
    installed_apps: str,
    app_dirs: str,
    base_dir: AppPath | None = None,
    include_default_app_dirs: bool = True,
) -> list[AppModule]:
    """
    Resolve configured app names from configured app search roots.

    Args:
        installed_apps: Comma-separated list of installed app names.
        app_dirs: Comma-separated list of app directories.
        base_dir: Base directory for relative app paths.
        include_default_app_dirs: Whether to include default app directories.
    """
    app_roots = [dir.strip() for dir in app_dirs.split(",") if dir.strip()]
    installed_apps_list = [
        app.strip() for app in installed_apps.split(",") if app.strip()
    ]

    if include_default_app_dirs:
        app_roots.extend(_DEFAULT_APP_DIRS)

    resolved: list[AppModule] = []
    seen: set[str] = set()

    for app_name in installed_apps_list:

        fs_path: str
        module_prefix: str
        if "." in app_name:
            fs_path, module_prefix = _resolve_dotted_app(app_name)
        else:
            for app_dir in app_roots:
                fs_root, module_root = _resolve_app_dir(app_dir, base_dir=base_dir)
                app_path = os.path.join(fs_root, app_name)
                
                if os.path.isfile(os.path.join(app_path, "__init__.py")):
                    fs_path = app_path
                    module_prefix = f"{module_root}.{app_name}"
                    break
            else:
                raise ModuleNotFoundError(
                    f"Installed app '{app_name}' could not be resolved"
                )

        if module_prefix in seen:
            continue
        seen.add(module_prefix)
        resolved.append((fs_path, module_prefix))

    return resolved


def set_models_pool(pool: dict[str, Any]) -> None:
    """Set the global models pool. Call this at app startup after scanning models."""
    models_pool.clear()
    models_pool.update(pool)


def scan_and_register_models(app_modules: list[AppModule]) -> None:
    """Scan app directories for SQLAlchemy models and register them in models_pool.

    Each entry in *app_dirs* is a directory that contains apps (sub-directories).
    For each discovered app, models are found by scanning ``{app}/models/*.py`` for classes with ``__tablename__``.

    Args:
        app_modules: List of (fs_path, module_prefix) tuples for apps to scan.
    """
    for fs_path, module_prefix in app_modules:
        models_dir = os.path.join(fs_path, "models")
        if os.path.isdir(models_dir):
            files = [
                file
                for file in os.listdir(models_dir)
                if file.endswith(".py") and file != "__init__.py"
            ]
            for file in files:
                module_name = f"{module_prefix}.models.{file[:-3]}"
                module = importlib.import_module(module_name)
                models = [
                    cls
                    for _, cls in inspect.getmembers(module, inspect.isclass)
                    if hasattr(cls, "__tablename__")
                    and cls.__module__ == module.__name__
                ]
                models_pool.update({model.__tablename__: model for model in models})
