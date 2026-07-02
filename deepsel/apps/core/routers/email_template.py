from deepsel.utils.crud_router import CRUDRouter
from deepsel.auth.get_current_user import get_current_user
from fastapi import Depends
from deepsel.apps.core.schemas.email_template import (
    EmailTemplateRead,
    EmailTemplateSearch,
    EmailTemplateCreate,
    EmailTemplateUpdate,
)

router = CRUDRouter(
    read_schema=EmailTemplateRead,
    search_schema=EmailTemplateSearch,
    create_schema=EmailTemplateCreate,
    update_schema=EmailTemplateUpdate,
    table_name="email_template",
    dependencies=[Depends(get_current_user)],
)
