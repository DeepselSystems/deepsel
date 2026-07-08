from .orm import ORMBaseMixin
from deepsel.orm import OrganizationMetaDataMixin


class BaseModel(ORMBaseMixin, OrganizationMetaDataMixin):
    pass
