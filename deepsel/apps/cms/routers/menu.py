from deepsel.utils.crud_router import CRUDRouter
from ..schemas.menu import MenuCreate, MenuRead, MenuSearch, MenuUpdate
from deepsel.deps import get_current_user
from fastapi import Depends

table_name = "menu"

router = CRUDRouter(
    read_schema=MenuRead,
    search_schema=MenuSearch,
    create_schema=MenuCreate,
    update_schema=MenuUpdate,
    table_name=table_name,
    dependencies=[Depends(get_current_user)],
)
