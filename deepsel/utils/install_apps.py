import csv
import importlib
import os
import logging
from fastapi import FastAPI
from sqlalchemy import text
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

        if os.path.isdir(f"{app_folder}/demo_data"):
            if not _demo_data_installed(db, app_folder):
                logger.info(f"Installing demo data for {app_folder}...")
                module = importlib.import_module(
                    f'{app_folder.replace("/", ".")}.demo_data'
                )
                import_order = getattr(module, "import_order", [])

                for file in import_order:
                    import_csv_data(
                        f"{app_folder}/demo_data/{file}", db, demo_data=True
                    )

                _mark_demo_data_installed(db, app_folder)


def _demo_data_installed(db: Session, app_folder: str) -> bool:
    result = db.execute(
        text("SELECT 1 FROM _demo_data_installed WHERE app_folder = :app"),
        {"app": app_folder},
    ).first()
    return result is not None


def _mark_demo_data_installed(db: Session, app_folder: str):
    db.execute(
        text("INSERT INTO _demo_data_installed (app_folder) VALUES (:app)"),
        {"app": app_folder},
    )
    db.commit()


def import_csv_data(
    file_name: str,
    db: Session,
    demo_data: bool = False,
    organization_id: int | None = None,
    base_dir: str = None,
    force_update: bool = False,
    auto_commit: bool = True,
):
    logger.debug(f"Importing {file_name}")
    # rm the .csv extension
    model_name = os.path.splitext(os.path.basename(file_name))[0]
    model = models_pool.get(model_name, None)
    if not model:
        return

    # Loop across all orgs only when the model is tenant-scoped AND neither the
    # caller nor the CSV header has pinned the rows to a specific org. If the
    # CSV carries an org column, it controls placement and a single install is
    # correct — looping would duplicate the same row N times.
    should_loop = (
        organization_id is None
        and hasattr(model, "organization_id")
        and not _csv_has_explicit_org(file_name)
    )

    if not should_loop:
        model.install_csv_data(
            file_name=file_name,
            db=db,
            demo_data=demo_data,
            organization_id=organization_id,
            base_dir=base_dir,
            force_update=force_update,
            auto_commit=auto_commit,
        )
        return

    OrganizationModel = models_pool.get("organization")
    org_ids = (
        [org_id for (org_id,) in db.query(OrganizationModel.id).all()]
        if OrganizationModel is not None
        else []
    )
    if not org_ids:
        logger.warning(
            f"No organizations found; skipping tenant-scoped seed {file_name}"
        )
        return

    for org_id in org_ids:
        model.install_csv_data(
            file_name=file_name,
            db=db,
            demo_data=demo_data,
            organization_id=org_id,
            base_dir=base_dir,
            force_update=force_update,
            auto_commit=auto_commit,
        )


def _csv_has_explicit_org(file_name: str) -> bool:
    """Return True if the CSV header carries an organization column in either
    the direct (`organization_id`) or related (`organization/organization_id`)
    form."""
    with open(file_name, "r", encoding="utf-8") as f:
        reader = csv.reader(f)
        try:
            header = next(reader)
        except StopIteration:
            return False
    return "organization_id" in header or "organization/organization_id" in header
