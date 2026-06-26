from deepsel.utils.crud_router import CRUDRouter
from ..schemas.openrouter_model import OpenRouterModelRead, OpenRouterModelSearch
from deepsel.auth.get_current_user import get_current_user
from fastapi import Depends

table_name = "openrouter_model"

router = CRUDRouter(
    read_schema=OpenRouterModelRead,
    search_schema=OpenRouterModelSearch,
    table_name=table_name,
    create_route=False,
    update_route=False,
    delete_one_route=False,
    delete_all_route=False,
    dependencies=[Depends(get_current_user)],
)
