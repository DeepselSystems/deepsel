from pydantic import BaseModel, Field


class MenuItem(BaseModel):
    id: int
    position: int
    title: str
    url: str
    open_in_new_tab: bool = False
    children: list["MenuItem"] = Field(default_factory=list)
