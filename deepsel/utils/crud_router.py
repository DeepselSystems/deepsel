from typing import Any, Callable, Optional, Type, Union
from fastapi_crudrouter.core import _utils
from fastapi_crudrouter.core._types import DEPENDENCIES, PAGINATION, PYDANTIC_SCHEMA
from deepsel.utils.generate_crud_schemas import (
    generate_create_schema,
    generate_update_schema,
)
from fastapi import (
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    UploadFile,
    status,
    Query,
)
from fastapi.responses import StreamingResponse
from fastapi_crudrouter import SQLAlchemyCRUDRouter
from fastapi_crudrouter.core.sqlalchemy import NOT_FOUND, IntegrityError
from sqlalchemy.orm import Session
from deepsel.orm import (
    DeleteResponse,
    OrderByCriteria,
    SearchQuery,
    BulkDeleteResponse,
)
from deepsel.utils.models_pool import models_pool
from deepsel.utils.api_router import get_api_prefix

# Module-level config — set via configure_crud_router() at app startup
_db_func: Optional[Callable] = None
_get_current_user_func: Optional[Callable] = None


def configure_crud_router(
    db_func: Callable,
    get_current_user_func: Callable,
) -> None:
    """Configure CRUDRouter dependencies. Call this at app startup before importing routers."""
    global _db_func, _get_current_user_func
    _db_func = db_func
    _get_current_user_func = get_current_user_func


# monkey patch this broken shit
def get_pk_type(schema: Type[PYDANTIC_SCHEMA], pk_field: str) -> Any:
    try:
        return schema.__fields__[pk_field].annotation
    except KeyError:
        return int


_utils.get_pk_type = get_pk_type

CALLABLE = Callable[..., Any]
CALLABLE_LIST = Callable[..., list[Any]]
CALLABLE_DICT = Callable[..., dict]


class CRUDRouter(SQLAlchemyCRUDRouter):
    def __init__(
        self,
        table_name: str,
        # schemas
        read_schema: Type[PYDANTIC_SCHEMA],
        search_schema: Optional[Type[PYDANTIC_SCHEMA]] = None,
        create_schema: Optional[Type[PYDANTIC_SCHEMA]] = None,
        update_schema: Optional[Type[PYDANTIC_SCHEMA]] = None,
        # optional configs
        prefix: Optional[str] = None,
        tags: Optional[list[str]] = None,
        paginate: Optional[int] = None,
        # enable or disable routes
        get_all_route: Union[bool, DEPENDENCIES] = False,
        get_one_route: Union[bool, DEPENDENCIES] = True,
        create_route: Union[bool, DEPENDENCIES] = True,
        update_route: Union[bool, DEPENDENCIES] = True,
        delete_one_route: Union[bool, DEPENDENCIES] = True,
        delete_all_route: Union[bool, DEPENDENCIES] = False,
        bulk_delete_route: Union[bool, DEPENDENCIES] = True,
        search_route: Union[bool, DEPENDENCIES] = True,
        export_route: Union[bool, DEPENDENCIES] = True,
        import_route: Union[bool, DEPENDENCIES] = True,
        **kwargs: Any,
    ) -> None:
        if _db_func is None or _get_current_user_func is None:
            raise RuntimeError(
                "CRUDRouter not configured. Call configure_crud_router() at app startup."
            )

        db_model = models_pool[table_name]
        # original fastapi_crudrouter.core._utils.schema_factory is broken as of 0.8.6
        # we catch the empty schema cases and do it ourselves
        create_schema = (
            create_schema if create_schema else generate_create_schema(db_model)
        )
        update_schema = (
            update_schema if update_schema else generate_update_schema(db_model)
        )

        prefix = str(prefix if prefix else table_name).lower()
        prefix = f"{get_api_prefix()}/{prefix.strip('/')}"
        if not tags:
            tags = [table_name.title()]

        super().__init__(
            schema=read_schema,
            db_model=db_model,
            db=_db_func,
            create_schema=create_schema,
            update_schema=update_schema,
            prefix=prefix,
            tags=tags,
            paginate=paginate,
            get_all_route=get_all_route,
            get_one_route=get_one_route,
            create_route=create_route,
            update_route=update_route,
            delete_one_route=False,  # we customize this
            delete_all_route=delete_all_route,
            **kwargs,
        )

        # override default delete one route
        if delete_one_route:
            self._add_api_route(
                "/{item_id}",
                self._delete_one(),
                methods=["DELETE"],
                response_model=DeleteResponse,
                summary="Delete One",
                dependencies=delete_one_route,
                error_responses=[NOT_FOUND],
            )

        # add bulk delete route
        if bulk_delete_route:
            self._add_api_route(
                "/bulk_delete",
                self._bulk_delete(),
                methods=["POST"],
                response_model=BulkDeleteResponse,
                summary="Bulk Delete",
                dependencies=bulk_delete_route,
            )

        # add search route
        if search_route:
            self._add_api_route(
                "/search",
                self._search(),
                methods=["POST"],
                response_model=search_schema or dict,  # type: ignore
                summary="Search",
                dependencies=search_route,
            )
        if export_route:
            self._add_api_route(
                "/export",
                self._get_export(),
                methods=["POST"],
                summary="Export CSV",
                dependencies=export_route,
            )

        if import_route:
            self._add_api_route(
                "/import",
                self._import_records(),
                methods=["POST"],
                summary="Import CSV",
                dependencies=import_route,
            )

    def _search(self, *args: Any, **kwargs: Any) -> CALLABLE_DICT:
        get_current_user = _get_current_user_func

        def route(
            db: Session = Depends(self.db_func),
            user=Depends(get_current_user),
            pagination: PAGINATION = self.pagination,
            search: Optional[SearchQuery] = None,
            order_by: Optional[OrderByCriteria] = None,
        ) -> dict:
            return self.db_model.search(db, user, pagination, search, order_by)

        return route

    def _get_all(self, *args: Any, **kwargs: Any) -> CALLABLE_LIST:
        get_current_user = _get_current_user_func

        def route(
            db: Session = Depends(self.db_func),
            user=Depends(get_current_user),
            pagination: PAGINATION = self.pagination,
        ) -> list[Any]:
            return self.db_model.get_all(db, user, pagination)

        return route

    def _get_one(self, *args: Any, **kwargs: Any) -> CALLABLE:
        get_current_user = _get_current_user_func

        def route(
            item_id: self._pk_type,
            db: Session = Depends(self.db_func),
            user=Depends(get_current_user),
        ) -> Any:

            model = self.db_model.get_one(db, user, item_id)

            if model:
                return model
            else:
                raise NOT_FOUND from None

        return route

    def _create(self, *args: Any, **kwargs: Any) -> CALLABLE:
        get_current_user = _get_current_user_func

        def route(
            model: self.create_schema,  # type: ignore
            background_tasks: BackgroundTasks,
            db: Session = Depends(self.db_func),
            user=Depends(get_current_user),
            external_username: Optional[str] = None,
        ) -> Any:
            try:
                return self.db_model.create(
                    db,
                    user,
                    model.dict(),
                    background_tasks=background_tasks,
                    external_username=external_username,
                )
            except Exception:
                db.rollback()
                raise

        return route

    def _update(self, *args: Any, **kwargs: Any) -> CALLABLE:
        get_current_user = _get_current_user_func

        def route(
            item_id: self._pk_type,  # type: ignore
            model: self.update_schema,  # type: ignore
            background_tasks: BackgroundTasks,
            db: Session = Depends(self.db_func),
            user=Depends(get_current_user),
            external_username: Optional[str] = None,
        ) -> Any:
            try:
                db_model = db.query(self.db_model).get(item_id)
                return db_model.update(
                    db,
                    user,
                    model.dict(exclude={self._pk}),
                    background_tasks=background_tasks,
                    external_username=external_username,
                )
            except IntegrityError as e:
                db.rollback()
                self._raise(e)

        return route

    def _delete_one(self, *args: Any, **kwargs: Any) -> CALLABLE:
        get_current_user = _get_current_user_func

        def route(
            item_id: self._pk_type,
            background_tasks: BackgroundTasks,
            db: Session = Depends(self.db_func),
            user=Depends(get_current_user),
            force: Optional[bool] = False,
        ) -> DeleteResponse:
            db_model = db.query(self.db_model).get(item_id)
            if not db_model:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND, detail="Record not found"
                )
            res = db_model.delete(
                db, user, force=force, background_tasks=background_tasks
            )
            return res

        return route

    def _get_export(
        self, *args: Any, **kwargs: Any
    ) -> Callable[..., StreamingResponse]:
        get_current_user = _get_current_user_func

        def route(
            db: Session = Depends(self.db_func),
            user=Depends(get_current_user),
            pagination: PAGINATION = self.pagination,
            search: Optional[SearchQuery] = None,
            order_by: Optional[OrderByCriteria] = None,
        ) -> StreamingResponse:
            result = self.db_model.export(db, user, pagination, search, order_by)
            # Return a StreamingResponse with CSV content
            response = StreamingResponse(
                iter([result.getvalue()]),
                media_type="text/csv",
                headers={
                    "Content-Disposition": "attachment;filename=dataset.csv",
                    "Access-Control-Expose-Headers": "Content-Disposition",
                },
            )
            return response

        return route

    def _import_records(self, *args: Any, **kwargs: Any) -> Callable:
        get_current_user = _get_current_user_func

        def route(
            background_tasks: BackgroundTasks,
            db: Session = Depends(self.db_func),
            user=Depends(get_current_user),
            file: UploadFile = File(...),
        ) -> dict:
            result = self.db_model.import_records(
                db, user, file, background_tasks=background_tasks
            )
            return result

        return route

    def _bulk_delete(self, *args: Any, **kwargs: Any) -> Callable:
        get_current_user = _get_current_user_func

        def route(
            db: Session = Depends(self.db_func),
            user=Depends(get_current_user),
            search: Optional[SearchQuery] = None,
            force: Optional[bool] = Query(default=False),
        ) -> dict:
            return self.db_model.bulk_delete(db, user, search, force)

        return route
