from sqlalchemy import Column, Integer, ForeignKey, Text, String
from deepsel.deps import Base
from deepsel.orm.base_model import BaseModel
from sqlalchemy.orm import relationship


class ThemeFileContentModel(Base, BaseModel):
    __tablename__ = "theme_file_content"

    id = Column(Integer, primary_key=True)
    content = Column(Text, nullable=False)

    # Language version - null for default, iso_code for language variants (e.g., "de")
    lang_code = Column(String(10), nullable=True)

    locale_id = Column(Integer, ForeignKey("locale.id"), nullable=True)
    locale = relationship("LocaleModel")

    theme_file_id = Column(Integer, ForeignKey("theme_file.id"), nullable=False)
    theme_file = relationship("ThemeFileModel", back_populates="contents")
