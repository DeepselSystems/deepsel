from fastapi import Depends

from deepsel.auth.get_current_user import get_current_user
from deepsel.utils.crud_router import CRUDRouter
from deepsel.utils.generate_crud_schemas import generate_CRUD_schemas

# CRUD routers are built from the registered model: `table_name` is the key the
# model scanner used, and the schemas are generated from the model's columns.
table_name = "example_item"
schemas = generate_CRUD_schemas(table_name)

router = CRUDRouter(
    table_name=table_name,
    read_schema=schemas.Read,
    search_schema=schemas.Search,
    dependencies=[Depends(get_current_user)],
)
