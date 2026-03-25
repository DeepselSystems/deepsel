import enum
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional, Type

from pydantic import BaseModel as PydanticModel

# Type alias replacing fastapi_crudrouter's PAGINATION
PAGINATION = dict[str, int | None]


class RelationshipRecordCollection(PydanticModel):
    relationship_name: str
    linked_records: list[dict[str, Any]] = []
    linked_model_class: Any


class Operator(str, enum.Enum):
    eq = "="
    ne = "!="
    in_ = "in"
    not_in = "not_in"
    between = "between"
    contains = "contains"
    gt = ">"
    gte = ">="
    lt = "<"
    lte = "<="
    like = "like"
    ilike = "ilike"


class SearchCriteria(PydanticModel):
    field: str
    operator: Operator
    value: str | int | float | datetime | list[str | int | float | datetime] | Any


class SearchQuery(PydanticModel):
    AND: Optional[list[SearchCriteria]] = []
    OR: Optional[list[SearchCriteria]] = []


class OrderDirection(str, enum.Enum):
    asc = "asc"
    desc = "desc"


class OrderByCriteria(PydanticModel):
    field: str
    direction: OrderDirection = "asc"


class PermissionScope(str, enum.Enum):
    none = "none"
    own = "own"
    org = "org"
    own_org = "own_org"
    all = "*"


class PermissionAction(str, enum.Enum):
    read = "read"
    write = "write"
    delete = "delete"
    create = "create"
    all = "*"


class DeleteResponse(PydanticModel):
    success: bool


class BulkDeleteResponse(DeleteResponse):
    deleted_count: int = 0


class CRUDSchema(PydanticModel):
    Read: Type[PydanticModel]
    Create: Type[PydanticModel]
    Update: Type[PydanticModel]
    Search: Type[PydanticModel]


@dataclass
class ServeResult:
    redirect_url: Optional[str] = None
    content: Optional[bytes] = None
    content_type: str = "application/octet-stream"
