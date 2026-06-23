from sqlalchemy import Column, Integer, ForeignKey, Text
from deepsel.deps import Base
from deepsel.orm.base_model import BaseModel
from sqlalchemy.orm import relationship


class TemplateContentModel(Base, BaseModel):
    __tablename__ = "template_content"

    id = Column(Integer, primary_key=True)
    content = Column(Text)

    locale_id = Column(Integer, ForeignKey("locale.id"), nullable=False)
    locale = relationship("LocaleModel")

    template_id = Column(Integer, ForeignKey("template.id"), nullable=False)
    template = relationship("TemplateModel", back_populates="contents")
