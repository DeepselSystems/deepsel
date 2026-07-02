from fastapi import Depends

from deepsel.utils.crud_router import CRUDRouter
from deepsel.utils.generate_crud_schemas import generate_search_schema
from deepsel.utils.models_pool import models_pool
from deepsel.auth.get_current_user import get_current_user
from deepsel.apps.core.schemas.locale import ReadSchema

table_name = "locale"
Model = models_pool[table_name]

SearchSchema = generate_search_schema(Model, ReadSchema)

router = CRUDRouter(
    read_schema=ReadSchema,
    search_schema=SearchSchema,
    table_name=table_name,
    dependencies=[Depends(get_current_user)],
    # This model is read only
    update_route=False,
    delete_one_route=False,
    create_route=False,
)
