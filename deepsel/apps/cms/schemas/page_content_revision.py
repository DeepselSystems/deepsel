from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict
from ._nested import ContentParentNested, UserNested


class PageContentRevisionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: Optional[str] = None
    revision_number: Optional[int] = None
    page_content_id: int
    old_content: Optional[str] = None
    new_content: Optional[str] = None
    string_id: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    active: Optional[bool] = True
    system: Optional[bool] = False
    organization_id: Optional[int] = None
    owner_id: Optional[int] = None
    owner: Optional[UserNested] = None
    page_content: Optional[ContentParentNested] = None


class PageContentRevisionSearch(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    total: int
    data: list[PageContentRevisionRead]


class PageContentRevisionUpdate(BaseModel):
    name: Optional[str] = None
