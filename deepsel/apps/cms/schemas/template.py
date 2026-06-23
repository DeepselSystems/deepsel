from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict
from .template_content import (
    TemplateContentCreateNested,
    TemplateContentRead,
)


class TemplateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    contents: list[TemplateContentRead] = []
    organization_id: Optional[int] = None
    owner_id: Optional[int] = None
    string_id: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    active: Optional[bool] = True
    system: Optional[bool] = False


class TemplateCreate(BaseModel):
    name: str
    contents: Optional[list[TemplateContentCreateNested]] = []
    organization_id: Optional[int] = None


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    contents: Optional[list[TemplateContentCreateNested]] = None
    string_id: Optional[str] = None


class TemplateSearch(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    total: int
    data: list[TemplateRead]
