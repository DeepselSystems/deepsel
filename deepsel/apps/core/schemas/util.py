from pydantic import BaseModel


class DeleteCheckResponse(BaseModel):
    to_delete: dict[str, list[str]]
    to_set_null: dict[str, list[str]]
