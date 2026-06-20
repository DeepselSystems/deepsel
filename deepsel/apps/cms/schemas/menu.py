from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class MenuChildRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    position: Optional[int] = 0
    translations: Optional[dict | list] = None
    open_in_new_tab: Optional[bool] = False
    parent_id: Optional[int] = None
    organization_id: Optional[int] = None
    owner_id: Optional[int] = None
    string_id: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    active: Optional[bool] = True
    system: Optional[bool] = False


class MenuRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    position: Optional[int] = 0
    translations: Optional[dict | list] = None
    open_in_new_tab: Optional[bool] = False
    parent_id: Optional[int] = None
    children: list[MenuChildRead] = []
    organization_id: Optional[int] = None
    owner_id: Optional[int] = None
    string_id: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    active: Optional[bool] = True
    system: Optional[bool] = False


class MenuChildCreateNested(BaseModel):
    id: Optional[int] = None
    position: Optional[int] = 0
    translations: Optional[dict | list] = None
    open_in_new_tab: Optional[bool] = False
    organization_id: Optional[int] = None


class MenuCreate(BaseModel):
    position: Optional[int] = 0
    translations: Optional[dict | list] = None
    open_in_new_tab: Optional[bool] = False
    parent_id: Optional[int] = None
    children: Optional[list[MenuChildCreateNested]] = []
    organization_id: Optional[int] = None


class MenuUpdate(BaseModel):
    position: Optional[int] = None
    translations: Optional[dict | list] = None
    open_in_new_tab: Optional[bool] = None
    parent_id: Optional[int] = None
    children: Optional[list[MenuChildCreateNested]] = None
    string_id: Optional[str] = None


class MenuSearch(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    total: int
    data: list[MenuRead]
