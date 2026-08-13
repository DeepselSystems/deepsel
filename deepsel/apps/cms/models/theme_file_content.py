from sqlalchemy import Column, Integer, ForeignKey, Text, String
from deepsel.deps import Base
from deepsel.orm.base_model import BaseModel
from sqlalchemy.orm import relationship


class ThemeFileContentModel(Base, BaseModel):
    __tablename__ = "theme_file_content"

    id = Column(Integer, primary_key=True)
    content = Column(Text, nullable=False)

    # DEPRECATED (since 1.0.13): language versions are now separate theme_file
    # rows whose file_path is lang-prefixed (e.g. "de/index.astro"). Kept for
    # wire/schema compatibility; always written as NULL. The 1.0.13 migration
    # converts existing lang_code rows to lang-prefixed file paths.
    lang_code = Column(String(10), nullable=True)

    # DEPRECATED (since 1.0.13): see lang_code above.
    locale_id = Column(Integer, ForeignKey("locale.id"), nullable=True)
    locale = relationship("LocaleModel")

    theme_file_id = Column(Integer, ForeignKey("theme_file.id"), nullable=False)
    theme_file = relationship("ThemeFileModel", back_populates="contents")
