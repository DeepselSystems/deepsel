from typing import Optional

from pydantic import BaseModel as PydanticModel


class App(PydanticModel):
    name: str
    display_name: Optional[str] = None
    description: Optional[str] = None


class GetAppsResponse(PydanticModel):
    total: int
    data: list[App]
