from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict
from deepsel.orm.cron_mixin import UnitInterval


class CronRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    model: str
    method: str
    arguments: Optional[str] = None
    enabled: Optional[bool] = False
    last_run: Optional[datetime] = None
    next_run: Optional[datetime] = None
    interval: int
    interval_unit: UnitInterval
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    string_id: Optional[str] = None
    active: Optional[bool] = True
    system: Optional[bool] = False


class CronCreate(BaseModel):
    name: str
    model: str
    method: str
    arguments: Optional[str] = "[]"
    enabled: Optional[bool] = False
    last_run: Optional[datetime] = None
    next_run: Optional[datetime] = None
    interval: Optional[int] = 1
    interval_unit: Optional[UnitInterval] = UnitInterval.days


class CronUpdate(BaseModel):
    name: Optional[str] = None
    model: Optional[str] = None
    method: Optional[str] = None
    arguments: Optional[str] = None
    enabled: Optional[bool] = None
    last_run: Optional[datetime] = None
    next_run: Optional[datetime] = None
    interval: Optional[int] = None
    interval_unit: Optional[UnitInterval] = None
    string_id: Optional[str] = None
    active: Optional[bool] = None


class CronSearch(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    total: int
    data: list[CronRead]
