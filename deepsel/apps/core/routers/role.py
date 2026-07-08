from deepsel.utils.crud_router import CRUDRouter
from deepsel.auth.get_current_user import get_current_user
from deepsel.apps.core.schemas.role import RoleRead, RoleCreate, RoleUpdate, RoleSearch
from fastapi import Depends

router = CRUDRouter(
    read_schema=RoleRead,
    search_schema=RoleSearch,
    create_schema=RoleCreate,
    update_schema=RoleUpdate,
    table_name="role",
    dependencies=[Depends(get_current_user)],
)
