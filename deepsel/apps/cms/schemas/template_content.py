from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict
from ._nested import LocaleNested


class TemplateContentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    content: Optional[str] = None
    locale_id: Optional[int] = None
    locale: Optional[LocaleNested] = None
    template_id: Optional[int] = None
    organization_id: Optional[int] = None
    owner_id: Optional[int] = None
    string_id: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    active: Optional[bool] = True
    system: Optional[bool] = False


class TemplateContentCreate(BaseModel):
    content: Optional[str] = None
    locale_id: int
    template_id: Optional[int] = None
    organization_id: Optional[int] = None


class TemplateContentCreateNested(BaseModel):
    id: Optional[int] = None
    content: Optional[str] = None
    locale_id: int
    organization_id: Optional[int] = None


class TemplateContentUpdate(BaseModel):
    content: Optional[str] = None
    locale_id: Optional[int] = None
    string_id: Optional[str] = None


class TemplateContentSearch(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    total: int
    data: list[TemplateContentRead]
