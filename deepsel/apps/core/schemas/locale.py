from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class ReadSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    iso_code: str
    emoji_flag: Optional[str] = None
    string_id: Optional[str] = None
    active: Optional[bool] = True
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
