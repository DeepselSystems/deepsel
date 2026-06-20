from deepsel.utils.crud_router import CRUDRouter
from ..schemas.blog_post_content import (
    BlogPostContentCreate,
    BlogPostContentRead,
    BlogPostContentSearch,
    BlogPostContentUpdate,
)
from deepsel.deps import get_current_user
from fastapi import Depends

table_name = "blog_post_content"

router = CRUDRouter(
    read_schema=BlogPostContentRead,
    search_schema=BlogPostContentSearch,
    create_schema=BlogPostContentCreate,
    update_schema=BlogPostContentUpdate,
    table_name=table_name,
    dependencies=[Depends(get_current_user)],
)
