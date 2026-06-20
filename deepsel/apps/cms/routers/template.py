import logging
from deepsel.utils.crud_router import CRUDRouter
from ..schemas.template import (
    TemplateCreate,
    TemplateRead,
    TemplateSearch,
    TemplateUpdate,
)
from deepsel.deps import get_current_user
from fastapi import Depends

logger = logging.getLogger(__name__)

table_name = "template"

router = CRUDRouter(
    read_schema=TemplateRead,
    search_schema=TemplateSearch,
    create_schema=TemplateCreate,
    update_schema=TemplateUpdate,
    table_name=table_name,
    dependencies=[Depends(get_current_user)],
)
