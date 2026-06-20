"""
Jinja2 global functions injected into every wysiwyg/template rendering environment.

To add a new global:
  1. Create a new file in this folder (e.g. image.py) with a make_<name>_func factory.
  2. Register it in build_jinja2_globals() below.
"""

from typing import Callable, Optional
from sqlalchemy.orm import Session

from .attachment import make_attachment_func


def build_jinja2_globals(
    db: Session,
    organization_id: int,
    lang: Optional[str],
) -> dict[str, Callable]:
    """
    Returns all Jinja2 global functions to inject into the rendering environment.
    """
    return {
        "attachment": make_attachment_func(db, organization_id, lang),
    }
