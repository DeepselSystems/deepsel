from deepsel.utils.crud_router import CRUDRouter
from deepsel.auth.get_current_user import get_current_user
from fastapi import Depends

from ..schemas.blog_post_content_revision import (
    BlogPostContentRevisionRead,
    BlogPostContentRevisionSearch,
    BlogPostContentRevisionUpdate,
)

router = CRUDRouter(
    read_schema=BlogPostContentRevisionRead,
    search_schema=BlogPostContentRevisionSearch,
    update_schema=BlogPostContentRevisionUpdate,
    table_name="blog_post_content_revision",
    dependencies=[Depends(get_current_user)],
    create_route=False,
    update_route=False,
    delete_one_route=False,
    delete_all_route=False,
    export_route=False,
    import_route=False,
)
