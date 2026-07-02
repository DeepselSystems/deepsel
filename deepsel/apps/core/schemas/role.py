from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class RoleImplied(BaseModel):
    """Minimal role schema for nested implied_roles reads (avoids recursion)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: Optional[str] = None
    permissions: Optional[str] = None
    organization_id: Optional[int] = None
    string_id: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    active: Optional[bool] = True
    system: Optional[bool] = False


class RoleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: Optional[str] = None
    permissions: Optional[str] = None
    organization_id: Optional[int] = None
    implied_roles: list[RoleImplied] = []
    string_id: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    active: Optional[bool] = True
    system: Optional[bool] = False


class RoleLinked(BaseModel):
    """Schema for linking existing roles by ID (many2many create/update)."""

    id: int


class RoleCreate(BaseModel):
    name: str
    description: Optional[str] = None
    permissions: Optional[str] = None
    organization_id: Optional[int] = None
    implied_roles: Optional[list[RoleLinked]] = []


class RoleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    permissions: Optional[str] = None
    implied_roles: Optional[list[RoleLinked]] = None
    string_id: Optional[str] = None
    active: Optional[bool] = None
    system: Optional[bool] = None


class RoleSearch(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    total: int
    data: list[RoleRead]
