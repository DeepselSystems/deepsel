from sqlalchemy import Column, Integer, String, Text
from deepsel.deps import Base
from deepsel.apps.core.mixins.base_model import BaseModel
from deepsel.orm.email_template_mixin import EmailTemplateMixin


class EmailTemplateModel(Base, EmailTemplateMixin, BaseModel):
    __tablename__ = "email_template"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    subject = Column(String, nullable=False, default="")
    content = Column(Text, nullable=False)

    # --- EmailTemplateMixin settings ---

    @classmethod
    def _get_organization_model(cls):
        from deepsel.apps.core.models.organization import OrganizationModel

        return OrganizationModel

    @classmethod
    def _get_super_org_string_id(cls):
        return "1"
