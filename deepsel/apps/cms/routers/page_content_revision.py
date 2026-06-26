from deepsel.utils.crud_router import CRUDRouter
from deepsel.auth.get_current_user import get_current_user
from fastapi import Depends

from ..schemas.page_content_revision import (
    PageContentRevisionRead,
    PageContentRevisionSearch,
    PageContentRevisionUpdate,
)

router = CRUDRouter(
    read_schema=PageContentRevisionRead,
    search_schema=PageContentRevisionSearch,
    update_schema=PageContentRevisionUpdate,
    table_name="page_content_revision",
    dependencies=[Depends(get_current_user)],
    create_route=False,
    update_route=False,
    delete_one_route=False,
    delete_all_route=False,
    export_route=False,
    import_route=False,
)
