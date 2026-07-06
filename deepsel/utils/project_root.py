"""Locate the consuming project's root directory (where client/ and themes/ live).

The backend either runs from ``<project>/backend`` (consumer apps) or from the
project root itself (deepsel standalone, where main.py and settings.py sit at
the repo root). Resolving from ``__file__`` would point at the installed
deepsel package instead of the project being served, so anchor on the
consumer's settings module (``backend_dir``) or the CWD and detect the layout
by looking for the ``themes/`` folder.
"""

import os


def get_project_root() -> str:
    """Return the project root: the first anchor candidate containing themes/."""
    from deepsel import deps

    backend_dir = getattr(deps.settings, "backend_dir", None) if deps.settings else None

    candidates: list[str] = []
    if backend_dir is not None:
        backend_dir = str(backend_dir)
        candidates += [backend_dir, os.path.dirname(backend_dir)]
    cwd = os.getcwd()
    candidates += [cwd, os.path.dirname(cwd)]

    for candidate in candidates:
        if os.path.isdir(os.path.join(candidate, "themes")):
            return os.path.normpath(candidate)

    # No themes/ found anywhere — fall back to the historical assumption
    # (parent of the backend dir, or of the CWD).
    return os.path.normpath(os.path.dirname(candidates[0]))
