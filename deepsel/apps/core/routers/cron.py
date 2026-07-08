from deepsel.utils.crud_router import CRUDRouter
from deepsel.apps.core.schemas.cron import CronRead, CronCreate, CronUpdate, CronSearch
from deepsel.auth.get_current_user import get_current_user
from fastapi import Depends, HTTPException
from deepsel.deps import get_db
from sqlalchemy.orm import Session
from deepsel.utils.models_pool import models_pool

table_name = "cron"
Model = models_pool[table_name]

router = CRUDRouter(
    read_schema=CronRead,
    search_schema=CronSearch,
    create_schema=CronCreate,
    update_schema=CronUpdate,
    table_name=table_name,
    dependencies=[Depends(get_current_user)],
)


@router.get("/execute/{id}")
async def execute_cron(
    id: int, db: Session = Depends(get_db), user=Depends(get_current_user)
):
    cron = db.query(Model).get(id)
    if not cron:
        return HTTPException(status_code=404, detail="Cron not found")

    await cron.execute(db)

    return {"message": "Cron executed successfully!"}
