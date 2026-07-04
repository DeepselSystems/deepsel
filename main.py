import logging
import os
import sys
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
import settings
from deepsel.sqlalchemy import DatabaseManager
from deepsel.utils.install_apps import install_routers, install_seed_data
from deepsel.utils.models_pool import (
    models_pool,
    scan_and_register_models,
    resolve_installed_apps,
    AppModule,
)
from deepsel.utils.server_events import on_startup, on_shutdown
from deepsel.deps import configure_deps
from db import Base, get_db, get_db_context

# =============================================================================
# Logging
# =============================================================================

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(levelname)s:     [%(asctime)s] %(name)s %(message)s",
    datefmt="%d-%m-%Y %H:%M:%S",
)
logger = logging.getLogger(__name__)

# =============================================================================
# Lifecycle
# =============================================================================


@asynccontextmanager
async def lifespan(application: FastAPI):
    # --- Startup ---
    # Resolve installed apps
    app_modules: list[AppModule] = resolve_installed_apps(
        installed_apps=settings.INSTALLED_APPS,
        app_dirs=settings.APP_DIRS,
        base_dir=settings._backend_dir,
    )
    logger.info(
        f"Installed apps: {', '.join([app_name for _, app_name in app_modules])}"
    )

    # Configure consumer dependencies for the deepsel package
    configure_deps(
        base=Base,
        get_db_func=get_db,
        get_db_context_func=get_db_context,
        settings_obj=settings,
    )

    # Discover and register models for the installed apps.
    # This will initialize the models_pool registry
    scan_and_register_models(app_modules=app_modules)

    if not settings.NO_MIGRATE:
        # DB migrations
        DatabaseManager(
            sqlalchemy_declarative_base=Base,
            db_url=settings.DATABASE_URL,
            models_pool=models_pool,
        )

        with get_db_context() as db:
            # Import seed CSV data for each installed app
            install_seed_data(
                app_modules=app_modules,
                db=db,
            )

            # Check app versions and run app upgrade tasks
            OrganizationModel = models_pool["organization"]
            org = db.query(OrganizationModel).get(settings.DEFAULT_ORG_ID)
            on_startup(
                db=db,
                app_modules=app_modules,
                src_version=settings.version,
                current_version=org.current_version,
                set_version=lambda db, v: setattr(org, "current_version", v),
            )

        # ONLY_MIGRATE — exit before server starts
        if settings.ONLY_MIGRATE:
            logger.info("Migration completed successfully, exiting (ONLY_MIGRATE)")
            sys.exit(0)
    else:
        logger.info("Skipping database setup (NO_MIGRATE)")

    from deepsel.auth.session import create_session_store

    # Initialize session store for cookie-based auth
    session_store = create_session_store(
        redis_url=settings.REDIS_URL,
        db_session_factory=get_db_context,
        session_dir=settings.SESSION_DIR,
        backend=settings.SESSION_STORE_BACKEND,
    )
    application.state.session_store = session_store

    # Register routers for each installed app
    install_routers(
        fastapi_app=application,
        app_modules=app_modules,
    )

    yield

    # --- Shutdown ---
    try:
        from deepsel.apps.cms.utils.client_process import get_client_manager

        manager = get_client_manager()
        if manager:
            manager.shutdown()
    except Exception:
        pass  # cms app not installed

    on_shutdown()


# =============================================================================
# App
# =============================================================================

app = FastAPI(
    title="Deepsel Template API",
    description="© Deepsel Inc.",
    version="4.0",
    lifespan=lifespan,
    docs_url="/" if settings.ENABLE_DOCS else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ALLOWED_ORIGINS,
    allow_origin_regex=settings.CORS_ALLOWED_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(SessionMiddleware, secret_key=settings.APP_SECRET)


@app.get(f"{settings.API_PREFIX}/openapi.json", include_in_schema=False)
def get_openapi_schema():
    return app.openapi()
