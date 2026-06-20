from enum import Enum
from typing import Optional
from pydantic import BaseModel, ConfigDict
from .openrouter_model import OpenRouterModelRead


class AIWritingContentType(str, Enum):
    page = "page"
    blog = "blog"
    template = "template"


class AIWritingMessage(BaseModel):
    role: str
    content: str


class AIWritingRequest(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    model_id: int
    prompt: str
    messages: Optional[list[AIWritingMessage]] = None
    content_type: AIWritingContentType = AIWritingContentType.page


class AIWritingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())

    title: str
    content: str
    model: OpenRouterModelRead
    prompt: str
