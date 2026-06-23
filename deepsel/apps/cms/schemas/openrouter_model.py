from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class OpenRouterModelRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    canonical_slug: str
    hugging_face_id: Optional[str] = None
    name: str
    description: Optional[str] = None
    context_length: Optional[int] = None
    created: Optional[int] = None
    architecture: Optional[dict | list] = None
    pricing: Optional[dict | list] = None
    top_provider: Optional[dict | list] = None
    per_request_limits: Optional[dict | list] = None
    supported_parameters: Optional[dict | list] = None
    organization_id: Optional[int] = None
    owner_id: Optional[int] = None
    string_id: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    active: Optional[bool] = True
    system: Optional[bool] = False


class OpenRouterModelSearch(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    total: int
    data: list[OpenRouterModelRead]
