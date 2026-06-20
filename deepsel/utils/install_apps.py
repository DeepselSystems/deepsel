import csv
import importlib
import os
import logging
from fastapi import FastAPI
from sqlalchemy import text
from sqlalchemy.orm import Session
from deepsel.utils.models_pool import models_pool, AppModule

logger = logging.getLogger(__name__)


def install_routers(
    *,
    fastapi_app: FastAPI,
    app_modules: list[AppModule],
) -> None:
    """Register API routers from installed apps to the FastAPI application.

    Iterates over resolved app modules, checks for a `routers/` directory, and imports
    all `.py` modules inside (excluding `__init__.py`). Each imported router module
    is expected to expose a `router` object, which is then registered via
    `fastapi_app.include_router()`.

    Args:
        fastapi_app: The FastAPI application instance to register routers on.
        app_modules: List of app modules to install routers for.
    """

    for fs_path, module_prefix in app_modules:
        logger.info(f"Installing routers for {module_prefix}...")
        routers_dir = os.path.join(fs_path, "routers")
        if not os.path.isdir(routers_dir):
            continue

        files = [
            file
            for file in os.listdir(routers_dir)
            if file.endswith(".py") and file != "__init__.py"
        ]
        for file in files:
            module_name = f"{module_prefix}.routers.{file[:-3]}"
            module = importlib.import_module(module_name)
            fastapi_app.include_router(module.router)


def install_seed_data(
    *,
    db: Session,
    app_modules: list[AppModule],
) -> None:
    """Import initial seed data and demo data for resolved apps.

    Looks for a `data/` or `demo_data/` directory in each resolved app module.
    For standard seed data, it imports the app's `data` module, reads the
    `import_order` attribute (a list of CSV files), and imports them.
    For demo data, it ensures that demo data has not already been loaded,
    then processes CSVs listed in `demo_data.import_order` and tracks execution
    in the database.

    Args:
        db: SQLAlchemy Session used to execute database operations.
        app_modules: List of app modules to install seed data for.
    """

    for fs_path, module_prefix in app_modules:
        logger.info(f"Installing seed data for {module_prefix}...")
        data_dir = os.path.join(fs_path, "data")
        if os.path.isdir(data_dir):
            module = importlib.import_module(f"{module_prefix}.data")
            import_order = getattr(module, "import_order", [])

            for file in import_order:
                import_csv_data(os.path.join(data_dir, file), db)

        demo_data_dir = os.path.join(fs_path, "demo_data")
        if not os.path.isdir(demo_data_dir) or _demo_data_installed(db, module_prefix):
            continue

        logger.info(f"Installing demo data for {module_prefix}...")
        module = importlib.import_module(f"{module_prefix}.demo_data")
        import_order = getattr(module, "import_order", [])

        for file in import_order:
            import_csv_data(os.path.join(demo_data_dir, file), db, demo_data=True)

        _mark_demo_data_installed(db, module_prefix)


def _demo_data_installed(db: Session, app_folder: str) -> bool:
    result = db.execute(
        text("SELECT 1 FROM _demo_data_installed WHERE app_folder = :app"),
        {"app": app_folder},
    ).first()
    return result is not None


def _mark_demo_data_installed(db: Session, app_folder: str) -> None:
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
    base_dir: str | None = None,
    force_update: bool = False,
    auto_commit: bool = True,
) -> None:
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
