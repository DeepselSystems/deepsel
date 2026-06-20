from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict
from .page_content import PageContentCreateNested, PageContentRead


class PageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    published: Optional[bool] = False
    is_homepage: Optional[bool] = False
    require_login: Optional[bool] = False
    page_custom_code: Optional[str] = None
    contents: list[PageContentRead] = []
    organization_id: Optional[int] = None
    owner_id: Optional[int] = None
    string_id: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    active: Optional[bool] = True
    system: Optional[bool] = False


class PageCreate(BaseModel):
    published: Optional[bool] = False
    is_homepage: Optional[bool] = False
    require_login: Optional[bool] = False
    page_custom_code: Optional[str] = None
    contents: Optional[list[PageContentCreateNested]] = []
    organization_id: Optional[int] = None


class PageUpdate(BaseModel):
    published: Optional[bool] = None
    is_homepage: Optional[bool] = None
    require_login: Optional[bool] = None
    page_custom_code: Optional[str] = None
    contents: Optional[list[PageContentCreateNested]] = None
    string_id: Optional[str] = None


class PageSearch(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    total: int
    data: list[PageRead]
