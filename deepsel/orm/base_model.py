from .mixin import ORMBaseMixin
from .organization_metadata import OrganizationMetaDataMixin


class BaseModel(ORMBaseMixin, OrganizationMetaDataMixin):
    pass
