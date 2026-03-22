from .mixin import ORMBaseMixin
from .base_model import BaseModel
from .organization_metadata import OrganizationMetaDataMixin
from .types import (
    Operator,
    SearchCriteria,
    SearchQuery,
    OrderDirection,
    OrderByCriteria,
    PermissionScope,
    PermissionAction,
    DeleteResponse,
    BulkDeleteResponse,
    RelationshipRecordCollection,
    PAGINATION,
)


def __getattr__(name):
    if name in ("AttachmentMixin", "AttachmentTypeOptions"):
        from .attachment_mixin import AttachmentMixin, AttachmentTypeOptions

        globals()["AttachmentMixin"] = AttachmentMixin
        globals()["AttachmentTypeOptions"] = AttachmentTypeOptions
        return globals()[name]
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


__all__ = [
    "ORMBaseMixin",
    "BaseModel",
    "OrganizationMetaDataMixin",
    "AttachmentMixin",
    "AttachmentTypeOptions",
    "Operator",
    "SearchCriteria",
    "SearchQuery",
    "OrderDirection",
    "OrderByCriteria",
    "PermissionScope",
    "PermissionAction",
    "DeleteResponse",
    "BulkDeleteResponse",
    "RelationshipRecordCollection",
    "PAGINATION",
]
