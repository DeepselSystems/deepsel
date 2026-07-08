from fastapi import APIRouter, Depends
from settings import INSTALLED_APPS
from deepsel.auth.get_current_user import get_current_user
from sqlalchemy.orm import Session
from deepsel.utils.models_pool import models_pool
from deepsel.deps import get_db
from fastapi import HTTPException, status
import importlib
from deepsel.utils.install_apps import import_csv_data
from sqlalchemy.exc import IntegrityError
import logging
from deepsel.apps.core.schemas.apps import GetAppsResponse

router = APIRouter(tags=["Apps"], prefix="/apps")
logger = logging.getLogger(__name__)
UserModel = models_pool["user"]


@router.post("/search", response_model=GetAppsResponse)
def get_apps(user: UserModel = Depends(get_current_user)):
    # check if user has Admin or Super Admin role
    if not any(
        role.string_id in ["admin_role", "website_admin_role"] for role in user.roles
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to read this resource type",
        )

    apps = [{"name": app.strip()} for app in INSTALLED_APPS.split(",")]
    return GetAppsResponse(total=len(apps), data=apps)


@router.post(
    "/load_demo_data/{app_name}",
)
def load_demo_data(
    app_name: str,
    user: UserModel = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not any(
        role.string_id in ["admin_role", "website_admin_role"] for role in user.roles
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to read this resource type",
        )

    if app_name not in [app.strip() for app in INSTALLED_APPS.split(",")]:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="App not found",
        )

    # import the app's "demo_data" module
    try:
        demo_data_module = importlib.import_module(f"apps.{app_name}.demo_data")
    except ImportError as e:
        print(e)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This module does not have demo data.",
        )
    # read import_order var
    import_order = getattr(demo_data_module, "import_order", [])
    if not import_order or not isinstance(import_order, list):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This module does not have demo data configured.",
        )

    try:
        app_folder = f"apps/{app_name}"
        for file in import_order:
            import_csv_data(f"{app_folder}/demo_data/{file}", db, demo_data=True)
    # catch unique constraint violation error
    except IntegrityError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Some data with unique constraints already exists in the database.",
        )
    except Exception as e:
        logger.error(e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while loading demo data.",
        )

    return {"success": True}
