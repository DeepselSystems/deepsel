import importlib
import os
import logging
from fastapi import FastAPI
from sqlalchemy.orm import Session
from deepsel.utils.models_pool import models_pool

logger = logging.getLogger(__name__)


def install_routers(fastapi_app: FastAPI, app_folders: list[str]):
    for app_folder in app_folders:
        logger.info(f"Installing routers for {app_folder}...")
        if os.path.isdir(f"{app_folder}/routers"):
            files = os.listdir(f"{app_folder}/routers")
            files = list(
                filter(lambda x: x[-3:] == ".py" and x != "__init__.py", files)
            )
            for file in files:
                module_name = f'{app_folder.replace("/", ".")}.routers.{file[:-3]}'
                module = importlib.import_module(module_name)
                fastapi_app.include_router(module.router)


def install_seed_data(app_folders: list[str], db: Session):
    for app_folder in app_folders:
        logger.info(f"Installing seed data for {app_folder}...")
        if os.path.isdir(f"{app_folder}/data"):
            module = importlib.import_module(f'{app_folder.replace("/", ".")}.data')
            import_order = getattr(module, "import_order", [])

            for file in import_order:
                import_csv_data(f"{app_folder}/data/{file}", db)


def import_csv_data(
    file_name: str,
    db: Session,
    demo_data: bool = False,
    organization_id: int = 1,
    base_dir: str = None,
    force_update: bool = False,
    auto_commit: bool = True,
):
    logger.debug(f"Importing {file_name}")
    # rm the .csv extension
    model_name = file_name.split("/")[-1][:-4]
    model = models_pool.get(model_name, None)
    if model:
        model.install_csv_data(
            file_name=file_name,
            db=db,
            demo_data=demo_data,
            organization_id=organization_id,
            base_dir=base_dir,
            force_update=force_update,
            auto_commit=auto_commit,
        )
