"""Backwards-compatible alias for the single ORM mixin stack.

The scope-aware organization resolution that used to live here is now the
default behavior of `deepsel.orm.mixin.ORMBaseMixin`, so the two stacks are one.
Prefer importing from `deepsel.orm` in new code.
"""

from deepsel.orm.mixin import ORMBaseMixin

__all__ = ["ORMBaseMixin"]
