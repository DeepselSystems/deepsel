from deepsel.utils.crud_router import CRUDRouter

from deepsel.apps.core.schemas.attachment import (
    AttachmentLocaleVersionRead,
    AttachmentLocaleVersionUpdateSearch,
    AttachmentLocaleVersionUpdate,
)

table_name = "attachment_locale_version"

router = CRUDRouter(
    read_schema=AttachmentLocaleVersionRead,
    search_schema=AttachmentLocaleVersionUpdateSearch,
    update_schema=AttachmentLocaleVersionUpdate,
    table_name=table_name,
    create_route=False,
    update_route=False,
)
