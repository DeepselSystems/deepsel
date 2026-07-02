from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class EmailTemplateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    subject: str
    content: str
    string_id: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    active: Optional[bool] = None
    organization_id: Optional[int] = None
    owner_id: Optional[int] = None


class EmailTemplateSearch(BaseModel):
    total: int
    data: list[EmailTemplateRead]


class EmailTemplateCreate(BaseModel):
    name: str
    subject: str = ""
    content: str
    organization_id: Optional[int] = None


class EmailTemplateUpdate(BaseModel):
    name: Optional[str] = None
    subject: Optional[str] = None
    content: Optional[str] = None
