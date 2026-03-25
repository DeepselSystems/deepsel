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
    if name == "UserMixin":
        from .user_mixin import UserMixin

        globals()["UserMixin"] = UserMixin
        return UserMixin
    if name == "OrganizationMixin":
        from .organization_mixin import OrganizationMixin

        globals()["OrganizationMixin"] = OrganizationMixin
        return OrganizationMixin
    if name == "EmailTemplateMixin":
        from .email_template_mixin import EmailTemplateMixin

        globals()["EmailTemplateMixin"] = EmailTemplateMixin
        return EmailTemplateMixin
    if name in ("CronMixin", "UnitInterval"):
        from .cron_mixin import CronMixin, UnitInterval

        globals()["CronMixin"] = CronMixin
        globals()["UnitInterval"] = UnitInterval
        return globals()[name]
    if name == "ActivityMixin":
        from .activity_mixin import ActivityMixin

        globals()["ActivityMixin"] = ActivityMixin
        return ActivityMixin
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


__all__ = [
    "ORMBaseMixin",
    "BaseModel",
    "OrganizationMetaDataMixin",
    "AttachmentMixin",
    "AttachmentTypeOptions",
    "UserMixin",
    "OrganizationMixin",
    "EmailTemplateMixin",
    "CronMixin",
    "UnitInterval",
    "ActivityMixin",
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
