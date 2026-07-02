from deepsel.utils.crud_router import CRUDRouter
from deepsel.auth.get_current_user import get_current_user
from fastapi import Depends
from deepsel.apps.core.schemas.organization import (
    ReadSchema,
    SearchSchema,
    CreateSchema,
    UpdateSchema,
)

router = CRUDRouter(
    read_schema=ReadSchema,
    search_schema=SearchSchema,
    create_schema=CreateSchema,
    update_schema=UpdateSchema,
    table_name="organization",
    dependencies=[Depends(get_current_user)],
    export_route=False,
    import_route=False,
)
