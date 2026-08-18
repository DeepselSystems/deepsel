"""Backwards-compatible alias for the single ORM mixin stack.

`deepsel.orm.BaseModel` now carries the scope-aware organization resolution that
used to be exclusive to this flavor. Prefer importing from `deepsel.orm` in new
code.
"""

from deepsel.orm import BaseModel, ORMBaseMixin

__all__ = ["BaseModel", "ORMBaseMixin"]
