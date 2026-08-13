import logging
import os
import io
import json
import shutil
import zipfile
from typing import Optional
from fastapi import (
    Depends,
    HTTPException,
    status,
    BackgroundTasks,
    APIRouter,
)
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session
from platformdirs import user_data_dir
from deepsel.deps import get_db, settings
from deepsel.auth.get_current_user import get_current_user
from deepsel.utils.models_pool import models_pool
from deepsel.utils.project_root import get_project_root

logger = logging.getLogger(__name__)

UserModel = models_pool["user"]

STATE_FILENAME = ".theme_state.json"
DATA_DIR = user_data_dir("deepsel-cms", "deepsel")
# Resolved via the shared helper so it works for both the consumer layout
# (backend runs from <project>/backend) and the deepsel standalone layout
# (main.py at the repo root). See deepsel/utils/project_root.py.
PROJECT_ROOT = get_project_root()
SOURCE_THEMES_DIR = os.path.join(PROJECT_ROOT, "themes")

router = APIRouter(prefix=f"{settings.API_PREFIX}/theme", tags=["Theme"])


def get_themes_dir() -> str:
    """Return the project themes directory path."""
    return SOURCE_THEMES_DIR


class ThemeInfo(BaseModel):
    """Schema for theme information"""

    name: str
    version: str
    folder_name: str
    description: Optional[str] = None
    image: Optional[str] = None


class SelectThemeRequest(BaseModel):
    """Schema for selecting a theme"""

    folder_name: str
    organization_id: int | None = None


class ThemeFileNode(BaseModel):
    """Schema for file tree node"""

    name: str
    path: str
    is_directory: bool
    children: Optional[list["ThemeFileNode"]] = None


class ThemeFileContentSchema(BaseModel):
    """Schema for theme file content"""

    id: Optional[int] = None
    content: str
    # DEPRECATED: language versions are separate lang-prefixed file paths now.
    # Accepted for wire compatibility with older admin builds, never persisted.
    lang_code: Optional[str] = None
    locale_id: Optional[int] = None


class SaveThemeFileRequest(BaseModel):
    """Schema for saving theme file"""

    theme_name: str
    file_path: str
    contents: list[ThemeFileContentSchema]


def check_website_admin_role(current_user: UserModel = Depends(get_current_user)):
    """Check if user has website_admin_role"""
    user_roles = current_user.get_user_roles()

    has_permission = any(
        role.string_id in ["admin_role", "website_admin_role"] for role in user_roles
    )

    if not has_permission:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only website admins can access themes",
        )

    return current_user


def _resolve_theme_path(folder_name: str) -> Optional[str]:
    """Find a theme's directory in the project themes folder."""
    path = os.path.join(SOURCE_THEMES_DIR, folder_name)
    if os.path.isdir(path):
        return path
    return None


def _validate_theme_file_path(file_path: str) -> str:
    """Normalize and validate a theme-relative file path.

    The theme editor can create arbitrary new paths (e.g. ``de/index.astro``),
    so anything that could escape the theme directory is rejected outright.
    Returns the normalized (forward-slash) path.
    """
    if not file_path or "\x00" in file_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid file path"
        )

    normalized = os.path.normpath(file_path).replace(os.sep, "/")
    if (
        os.path.isabs(file_path)
        or file_path.startswith(("/", "\\"))
        or os.path.isabs(normalized)
        or normalized.startswith("/")
        or normalized == ".."
        or normalized.startswith("../")
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file path: must be relative to the theme directory",
        )
    return normalized


def _scan_themes_in_dir(themes_dir: str) -> dict:
    """Scan a directory for themes with package.json, returns dict keyed by folder_name."""
    themes = {}
    if not os.path.exists(themes_dir):
        return themes

    for folder_name in os.listdir(themes_dir):
        folder_path = os.path.join(themes_dir, folder_name)
        if not os.path.isdir(folder_path):
            continue

        package_json_path = os.path.join(folder_path, "package.json")
        if os.path.exists(package_json_path):
            try:
                with open(package_json_path, "r", encoding="utf-8") as f:
                    package_data = json.load(f)

                themes[folder_name] = ThemeInfo(
                    name=package_data.get("name", folder_name),
                    version=package_data.get("version", "unknown"),
                    folder_name=folder_name,
                )
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse package.json in {folder_name}: {e}")
            except Exception as e:
                logger.error(f"Error reading theme {folder_name}: {e}")

    return themes


@router.get("/list", response_model=list[ThemeInfo])
def list_themes(current_user: UserModel = Depends(check_website_admin_role)):
    """
    List all available themes from the project themes/ folder.
    """
    try:
        themes_dict = _scan_themes_in_dir(SOURCE_THEMES_DIR)

        # Enrich with theme.json metadata
        for folder_name, theme_info in themes_dict.items():
            theme_path = _resolve_theme_path(folder_name)
            if not theme_path:
                continue
            theme_json_path = os.path.join(theme_path, "theme.json")
            if os.path.exists(theme_json_path):
                try:
                    with open(theme_json_path, "r", encoding="utf-8") as f:
                        theme_meta = json.load(f)
                    if theme_meta.get("name"):
                        theme_info.name = theme_meta["name"]
                    theme_info.description = theme_meta.get("description")
                    theme_info.image = theme_meta.get("image")
                except (json.JSONDecodeError, Exception) as e:
                    logger.warning(f"Failed to read theme.json in {folder_name}: {e}")

        return list(themes_dict.values())

    except Exception as e:
        logger.error(f"Error listing themes: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list themes: {str(e)}",
        )


class ThemePageSlugsResponse(BaseModel):
    """Schema for theme page slugs"""

    theme_name: str
    slugs: list[str]


@router.get("/page-slugs/{theme_name}", response_model=ThemePageSlugsResponse)
def get_theme_page_slugs_endpoint(
    theme_name: str,
    current_user: UserModel = Depends(check_website_admin_role),
):
    """
    Return slugs claimed by the theme's custom pages + homepage.
    Used by the admin to detect slug conflicts between pages and theme files.
    """
    from ..utils.theme_pages import get_theme_page_slugs

    slugs = get_theme_page_slugs(theme_name)
    return ThemePageSlugsResponse(theme_name=theme_name, slugs=slugs)


@router.get("/preview-image/{theme_name}/{image_path:path}")
def get_theme_preview_image(
    theme_name: str,
    image_path: str,
):
    """Serve a theme preview image file."""
    theme_dir = _resolve_theme_path(theme_name)
    if not theme_dir:
        raise HTTPException(status_code=404, detail="Theme not found")

    full_path = os.path.join(theme_dir, image_path)

    # Security: ensure the resolved path is within the theme directory
    real_path = os.path.realpath(full_path)
    real_theme = os.path.realpath(theme_dir)
    if not real_path.startswith(real_theme):
        raise HTTPException(status_code=403, detail="Access denied")

    if not os.path.exists(full_path) or not os.path.isfile(full_path):
        raise HTTPException(status_code=404, detail="Image not found")

    return FileResponse(full_path)


SKIP_DIRS = {"node_modules", "dist", ".astro", ".git", "__pycache__"}


@router.get("/download/{theme_name}")
def download_theme(
    theme_name: str,
    current_user: UserModel = Depends(check_website_admin_role),
):
    """Download original theme files as a zip archive (without user edits)."""
    # Use SOURCE_THEMES_DIR to get original files without DB edits
    theme_path = os.path.join(os.path.normpath(SOURCE_THEMES_DIR), theme_name)

    if not os.path.isdir(theme_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Theme '{theme_name}' not found",
        )

    # Security: ensure resolved path is within source themes dir
    real_path = os.path.realpath(theme_path)
    real_source = os.path.realpath(SOURCE_THEMES_DIR)
    if not real_path.startswith(real_source):
        raise HTTPException(status_code=403, detail="Access denied")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(theme_path):
            # Skip unwanted directories in-place
            dirs[:] = [d for d in dirs if d not in SKIP_DIRS and not d.startswith(".")]
            for filename in files:
                if filename.startswith("."):
                    continue
                abs_path = os.path.join(root, filename)
                arc_name = os.path.join(
                    theme_name, os.path.relpath(abs_path, theme_path)
                )
                zf.write(abs_path, arc_name)

    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{theme_name}.zip"'},
    )


@router.post("/select")
def select_theme(
    request: SelectThemeRequest,
    background_tasks: BackgroundTasks,
    current_user: UserModel = Depends(check_website_admin_role),
    db: Session = Depends(get_db),
):
    """
    Select a theme for the organization.
    Updates the selected_theme field in CMSSettingsModel.
    """
    try:
        # Verify theme exists (check both data dir and source dir)
        theme_path = _resolve_theme_path(request.folder_name)
        if not theme_path:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Theme '{request.folder_name}' not found",
            )

        # Use org from request body if provided, fallback to current org context
        organization_id = request.organization_id or getattr(
            current_user, "current_organization_id", None
        )
        if not organization_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="X-Organization-Id header or organization_id in body required",
            )

        # Get CMSSettingsModel
        CMSSettingsModel = models_pool.get("organization")
        organization = (
            db.query(CMSSettingsModel)
            .filter(CMSSettingsModel.id == organization_id)
            .first()
        )

        if not organization:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Organization not found",
            )

        # Update selected theme
        organization.selected_theme = request.folder_name
        db.commit()

        # Load seed data and run post_install for the newly selected theme
        from ..utils.setup_themes import load_seed_data_for_theme

        load_seed_data_for_theme(
            request.folder_name, db, organization_id=organization_id
        )

        logger.info(
            f"User {current_user.email or current_user.username} selected theme '{request.folder_name}' "
            f"for organization {organization_id}"
        )

        # Regenerate imports for the newly selected theme
        if settings.NO_CLIENT:
            # Dev mode: regenerate files synchronously, Astro HMR handles the rest
            from ..utils.theme_imports import (
                generate_theme_imports,
                generate_tailwind_config,
            )

            generate_theme_imports(
                data_dir_path=PROJECT_ROOT, selected_theme=request.folder_name
            )
            generate_tailwind_config(
                data_dir_path=PROJECT_ROOT, selected_theme=request.folder_name
            )
            rebuilding = False
        else:
            # Production: trigger full rebuild in background
            background_tasks.add_task(
                trigger_setup_themes, selected_theme=request.folder_name
            )
            rebuilding = True

        return {
            "success": True,
            "message": f"Theme '{request.folder_name}' selected successfully",
            "selected_theme": request.folder_name,
            "rebuilding": rebuilding,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error selecting theme: {e}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to select theme: {str(e)}",
        )


@router.post("/upgrade-data")
def upgrade_theme_data(
    background_tasks: BackgroundTasks,
    current_user: UserModel = Depends(check_website_admin_role),
    db: Session = Depends(get_db),
):
    """Re-run seed data loading for the currently selected theme."""
    try:
        organization_id = getattr(current_user, "current_organization_id", None)
        if not organization_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="X-Organization-Id header required",
            )

        CMSSettingsModel = models_pool.get("organization")
        org = (
            db.query(CMSSettingsModel)
            .filter(CMSSettingsModel.id == organization_id)
            .first()
        )
        selected_theme = org.selected_theme if org else None
        if not selected_theme:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No theme is currently selected",
            )

        theme_path = _resolve_theme_path(selected_theme)
        if not theme_path:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Theme '{selected_theme}' not found on disk",
            )

        from ..utils.setup_themes import load_seed_data_for_theme

        load_seed_data_for_theme(selected_theme, db, organization_id=organization_id)

        logger.info(
            f"User {current_user.email or current_user.username} upgraded theme data for "
            f"'{selected_theme}' (organization {organization_id})"
        )

        if settings.NO_CLIENT:
            from ..utils.theme_imports import (
                generate_theme_imports,
                generate_tailwind_config,
            )

            generate_theme_imports(
                data_dir_path=PROJECT_ROOT, selected_theme=selected_theme
            )
            generate_tailwind_config(
                data_dir_path=PROJECT_ROOT, selected_theme=selected_theme
            )
            rebuilding = False
        else:
            background_tasks.add_task(
                trigger_setup_themes, selected_theme=selected_theme
            )
            rebuilding = True

        return {
            "success": True,
            "message": f"Theme data for '{selected_theme}' upgraded successfully",
            "rebuilding": rebuilding,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error upgrading theme data: {e}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upgrade theme data: {str(e)}",
        )


@router.get("/build-status")
def get_build_status_endpoint(
    current_user: UserModel = Depends(check_website_admin_role),
):
    """Return current theme build status for admin polling."""
    from ..utils.build_status import get_build_status

    return get_build_status()


@router.post("/reset")
def reset_theme(
    request: SelectThemeRequest,
    background_tasks: BackgroundTasks,
    current_user: UserModel = Depends(check_website_admin_role),
    db: Session = Depends(get_db),
):
    """
    Reset a theme to its default state by deleting all DB edits
    and restoring original files from source.
    """
    # Verify theme exists
    theme_path = _resolve_theme_path(request.folder_name)
    if not theme_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Theme '{request.folder_name}' not found",
        )

    current_org_id = getattr(current_user, "current_organization_id", None)
    if current_org_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="X-Organization-Id header required",
        )

    try:
        ThemeFileModel = models_pool.get("theme_file")
        ThemeFileContentModel = models_pool.get("theme_file_content")

        # Get theme file IDs for THIS org only, then delete content first (FK constraint)
        theme_file_ids = [
            tf.id
            for tf in db.query(ThemeFileModel.id)
            .filter(
                ThemeFileModel.theme_name == request.folder_name,
                ThemeFileModel.organization_id == current_org_id,
            )
            .all()
        ]

        if theme_file_ids:
            db.query(ThemeFileContentModel).filter(
                ThemeFileContentModel.theme_file_id.in_(theme_file_ids)
            ).delete(synchronize_session=False)

        deleted = (
            db.query(ThemeFileModel)
            .filter(
                ThemeFileModel.theme_name == request.folder_name,
                ThemeFileModel.organization_id == current_org_id,
            )
            .delete(synchronize_session=False)
        )
        db.commit()

        # Clean up THIS org's overlay directory on disk
        from platformdirs import user_data_dir as _user_data_dir

        overlay_dir = os.path.join(
            _user_data_dir("deepsel-cms", "deepsel"),
            "themes",
            f"org_{current_org_id}",
            request.folder_name,
        )
        if os.path.exists(overlay_dir):
            shutil.rmtree(overlay_dir, ignore_errors=True)
            logger.info(f"Removed org overlay directory: {overlay_dir}")

        # Language versions live inside the theme itself (themes/<theme>/<lang>/)
        # and are part of the source, so nothing else to clean up here.

        # Rebuild in background (pass selected theme for single-theme imports)
        CMSSettingsModel = models_pool.get("organization")
        org = (
            db.query(CMSSettingsModel)
            .filter(CMSSettingsModel.id == current_org_id)
            .first()
        )
        current_selected = org.selected_theme if org else None
        background_tasks.add_task(
            trigger_setup_themes,
            force_sync=True,
            selected_theme=current_selected,
        )

        logger.info(
            f"User {current_user.email or current_user.username} reset theme '{request.folder_name}' "
            f"({deleted} file records deleted)"
        )

        return {
            "success": True,
            "message": f"Theme '{request.folder_name}' has been reset to default.",
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error resetting theme: {e}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to reset theme: {str(e)}",
        )


def build_file_tree(directory_path: str, base_path: str = "") -> list[ThemeFileNode]:
    """Recursively build file tree structure"""
    nodes = []

    try:
        items = sorted(os.listdir(directory_path))

        for item in items:
            # Skip node_modules and hidden files
            if item.startswith(".") or item == "node_modules":
                continue

            item_path = os.path.join(directory_path, item)
            relative_path = os.path.join(base_path, item) if base_path else item

            if os.path.isdir(item_path):
                # Recursively get children for directories
                children = build_file_tree(item_path, relative_path)
                nodes.append(
                    ThemeFileNode(
                        name=item,
                        path=relative_path,
                        is_directory=True,
                        children=children,
                    )
                )
            else:
                nodes.append(
                    ThemeFileNode(name=item, path=relative_path, is_directory=False)
                )

    except Exception as e:
        logger.error(f"Error building file tree for {directory_path}: {e}")

    return nodes


def merge_path_into_tree(nodes: list[ThemeFileNode], file_path: str) -> None:
    """Insert a (possibly nested) file path into an existing file tree in place.

    Used to surface DB-only files — e.g. a language version created from the
    admin editor — that have no counterpart in the theme source directory.
    """
    parts = [p for p in file_path.replace(os.sep, "/").split("/") if p and p != "."]
    if not parts:
        return

    current = nodes
    prefix = ""
    for part in parts[:-1]:
        prefix = f"{prefix}/{part}" if prefix else part
        existing = next((n for n in current if n.is_directory and n.name == part), None)
        if not existing:
            existing = ThemeFileNode(
                name=part, path=prefix, is_directory=True, children=[]
            )
            current.append(existing)
            current.sort(key=lambda n: n.name)
        if existing.children is None:
            existing.children = []
        current = existing.children

    name = parts[-1]
    full_path = f"{prefix}/{name}" if prefix else name
    if not any(n.name == name and not n.is_directory for n in current):
        current.append(ThemeFileNode(name=name, path=full_path, is_directory=False))
        current.sort(key=lambda n: n.name)


@router.get("/files/{theme_name}", response_model=list[ThemeFileNode])
def list_theme_files(
    theme_name: str,
    current_user: UserModel = Depends(check_website_admin_role),
    db: Session = Depends(get_db),
):
    """
    List all files in a theme as a tree structure. DB-only files saved by this
    org (files that exist as theme_file rows but not in the theme source) are
    merged into the tree so they remain editable.
    """
    theme_path = os.path.join(get_themes_dir(), theme_name)

    if not theme_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Theme '{theme_name}' not found",
        )

    tree = build_file_tree(theme_path)

    current_org_id = getattr(current_user, "current_organization_id", None)
    if current_org_id is not None:
        ThemeFileModel = models_pool.get("theme_file")
        db_paths = (
            db.query(ThemeFileModel.file_path)
            .filter(
                ThemeFileModel.theme_name == theme_name,
                ThemeFileModel.organization_id == current_org_id,
            )
            .all()
        )
        for (file_path,) in db_paths:
            if not file_path:
                continue
            if os.path.exists(os.path.join(theme_path, file_path)):
                continue
            merge_path_into_tree(tree, file_path)

    return tree


@router.get("/file/{theme_name}/{file_path:path}")
def get_theme_file(
    theme_name: str,
    file_path: str,
    current_user: UserModel = Depends(check_website_admin_role),
    db: Session = Depends(get_db),
):
    """
    Get a theme file content. Returns both filesystem content and any saved DB versions.

    A file may exist only in the DB (e.g. a language version created from the
    admin editor); in that case the DB content is returned and
    ``exists_on_disk`` is False.
    """
    current_org_id = getattr(current_user, "current_organization_id", None)
    if current_org_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="X-Organization-Id header required",
        )

    file_path = _validate_theme_file_path(file_path)

    try:
        ThemeFileModel = models_pool.get("theme_file")

        # Read default file from filesystem
        full_path = os.path.join(get_themes_dir(), theme_name, file_path)
        exists_on_disk = os.path.isfile(full_path)

        # Check if file has DB records for THIS org
        theme_file = (
            db.query(ThemeFileModel)
            .filter(
                ThemeFileModel.theme_name == theme_name,
                ThemeFileModel.file_path == file_path,
                ThemeFileModel.organization_id == current_org_id,
            )
            .first()
        )

        if not exists_on_disk and not theme_file:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"File not found: {file_path}",
            )

        default_content = ""
        if exists_on_disk:
            with open(full_path, "r", encoding="utf-8") as f:
                default_content = f.read()

        contents = []

        if theme_file:
            # Return DB contents
            for content in theme_file.contents:
                contents.append(
                    {
                        "id": content.id,
                        "content": content.content,
                        "lang_code": content.lang_code,
                        "locale_id": content.locale_id,
                        "locale": (
                            {
                                "id": content.locale.id,
                                "name": content.locale.name,
                                "iso_code": content.locale.iso_code,
                            }
                            if content.locale
                            else None
                        ),
                    }
                )
        else:
            # Return filesystem content as default
            contents.append(
                {
                    "id": None,
                    "content": default_content,
                    "lang_code": None,
                    "locale_id": None,
                    "locale": None,
                }
            )

        return {
            "theme_name": theme_name,
            "file_path": file_path,
            "exists_on_disk": exists_on_disk,
            "contents": contents,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting theme file: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get theme file: {str(e)}",
        )


THEME_BUILD_LOCK_ID = 748329  # Arbitrary constant for PG advisory lock


def try_acquire_build_lock(db: Session):
    """Try to acquire the PG advisory build lock.

    Session-level advisory locks belong to a specific DB connection, and the
    ORM session returns its pooled connection at every commit/rollback — so
    acquiring and releasing through `db` can silently target two different
    connections, leaving the lock held forever. Acquire on a dedicated
    autocommit connection instead, which the caller keeps for the whole
    request and passes to release_build_lock().

    Returns the connection holding the lock, or None if it is held elsewhere.
    """
    conn = db.get_bind().engine.connect().execution_options(
        isolation_level="AUTOCOMMIT"
    )
    acquired = conn.execute(
        text("SELECT pg_try_advisory_lock(:id)"), {"id": THEME_BUILD_LOCK_ID}
    ).scalar()
    if not acquired:
        conn.close()
        return None
    return conn


def release_build_lock(lock_conn):
    """Release the PG advisory build lock held by `lock_conn`."""
    try:
        lock_conn.execute(
            text("SELECT pg_advisory_unlock(:id)"), {"id": THEME_BUILD_LOCK_ID}
        )
    finally:
        # Discard the raw DB connection instead of returning it to the pool:
        # the lock dies with the connection even if the unlock above failed.
        lock_conn.invalidate()
        lock_conn.close()


def trigger_setup_themes(force_sync=False, selected_theme: str | None = None):
    """
    Background task to run full theme setup (idempotent)

    Args:
        force_sync: If True, force sync themes folder to restore original files
        selected_theme: If provided, only import this theme
    """
    from ..utils.build_status import set_building, set_idle, set_error

    try:
        set_building(selected_theme or "unknown")
        from ..utils.setup_themes import setup_themes

        logger.info("Running theme setup after theme change...")
        setup_themes(
            force_build=True,
            force_sync=force_sync,
            selected_theme=selected_theme,
        )
        logger.info("Theme setup completed successfully")

        # Restart client to pick up the new build
        from ..utils.client_process import get_client_manager

        manager = get_client_manager()
        if manager:
            logger.info("Restarting Astro client after theme rebuild...")
            manager.restart()

        set_idle()
    except Exception as e:
        logger.error(f"Error during theme setup: {e}")
        set_error(str(e))


@router.post("/file/save")
def save_theme_file(
    request: SaveThemeFileRequest,
    background_tasks: BackgroundTasks,
    current_user: UserModel = Depends(check_website_admin_role),
    db: Session = Depends(get_db),
):
    """
    Save theme file content. Validates by building in an isolated temp directory first.
    Only commits to DB and filesystem if the build succeeds.
    """
    # Acquire advisory lock to prevent concurrent builds
    lock_conn = try_acquire_build_lock(db)
    if lock_conn is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A theme build is already in progress. Please try again shortly.",
        )

    current_org_id = getattr(current_user, "current_organization_id", None)
    if current_org_id is None:
        release_build_lock(lock_conn)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="X-Organization-Id header required",
        )

    temp_dir = None
    try:
        # The editor can create new paths (e.g. "de/index.astro"); make sure
        # they stay inside the theme directory.
        request.file_path = _validate_theme_file_path(request.file_path)

        # Phase 1: Validate build in isolation (no DB/filesystem changes yet).
        # In dev mode the data dir isn't populated (no npm workspace, no
        # node_modules, no package.json) so the temp build can't run — and
        # it isn't needed either, because Astro dev catches breakage live
        # through HMR. Skip straight to the DB write.
        from ..utils.setup_themes import validate_theme_build

        if not settings.NO_CLIENT:
            temp_dir = validate_theme_build(
                theme_name=request.theme_name,
                file_path=request.file_path,
                contents=request.contents,
                organization_id=current_org_id,
            )

        # Phase 2: Build succeeded — apply changes
        ThemeFileModel = models_pool.get("theme_file")
        ThemeFileContentModel = models_pool.get("theme_file_content")

        # Get or create theme file record FOR THIS ORG
        theme_file = (
            db.query(ThemeFileModel)
            .filter(
                ThemeFileModel.theme_name == request.theme_name,
                ThemeFileModel.file_path == request.file_path,
                ThemeFileModel.organization_id == current_org_id,
            )
            .first()
        )

        if not theme_file:
            theme_file = ThemeFileModel(
                theme_name=request.theme_name,
                file_path=request.file_path,
                organization_id=current_org_id,
            )
            db.add(theme_file)
            db.flush()

        # Get existing content IDs from DB
        existing_contents = (
            db.query(ThemeFileContentModel)
            .filter(ThemeFileContentModel.theme_file_id == theme_file.id)
            .all()
        )
        existing_ids = {content.id for content in existing_contents}

        # Get content IDs from request (excluding new ones)
        request_ids = {
            content_data.id
            for content_data in request.contents
            if content_data.id is not None
        }

        # Delete contents that are in DB but not in request
        ids_to_delete = existing_ids - request_ids
        has_deletions = len(ids_to_delete) > 0
        if has_deletions:
            db.query(ThemeFileContentModel).filter(
                ThemeFileContentModel.id.in_(ids_to_delete)
            ).delete(synchronize_session=False)
            logger.info(f"Deleted {len(ids_to_delete)} removed language versions")

        # Process each content version. lang_code/locale_id are deprecated:
        # a language version is its own lang-prefixed file_path, so contents
        # are always stored language-agnostic.
        for content_data in request.contents:
            if content_data.id:
                db_content = (
                    db.query(ThemeFileContentModel)
                    .filter(ThemeFileContentModel.id == content_data.id)
                    .first()
                )
                if db_content:
                    db_content.content = content_data.content
                    db_content.lang_code = None
                    db_content.locale_id = None
            else:
                db_content = ThemeFileContentModel(
                    content=content_data.content,
                    lang_code=None,
                    locale_id=None,
                    theme_file_id=theme_file.id,
                    organization_id=current_org_id,
                )
                db.add(db_content)

        db.commit()

        if settings.NO_CLIENT:
            # Dev mode: no managed Astro client to restart, no data-dir build
            # artifacts to swap. Reconcile the overlay tree against the repo
            # so the Astro dev server's HMR picks up the new files, and
            # regenerate themes.ts so any newly-introduced overlay entries
            # become importable.
            from ..utils.setup_themes import reconcile_theme_overlays
            from ..utils.theme_imports import (
                generate_theme_imports,
                generate_tailwind_config,
            )

            reconcile_theme_overlays(PROJECT_ROOT, force=True)
            generate_theme_imports(
                data_dir_path=PROJECT_ROOT, selected_theme=request.theme_name
            )
            generate_tailwind_config(
                data_dir_path=PROJECT_ROOT, selected_theme=request.theme_name
            )
        else:
            # Production: copy validated build artifacts into the real data dir
            # then trigger setup_themes in the background for state-hash bookkeeping.
            real_dist = os.path.join(DATA_DIR, "client", "dist")
            temp_dist = os.path.join(temp_dir, "client", "dist")
            if os.path.exists(temp_dist):
                if os.path.exists(real_dist):
                    shutil.rmtree(real_dist)
                shutil.copytree(temp_dist, real_dist)

            if has_deletions:
                background_tasks.add_task(
                    trigger_setup_themes,
                    force_sync=True,
                    selected_theme=request.theme_name,
                )
            else:
                background_tasks.add_task(
                    trigger_setup_themes, selected_theme=request.theme_name
                )

            # Restart client to pick up the new build
            from ..utils.client_process import get_client_manager

            manager = get_client_manager()
            if manager:
                logger.info("Restarting Astro client after successful theme build...")
                manager.restart()

        logger.info(f"Saved theme file: {request.theme_name}/{request.file_path}")

        return {
            "success": True,
            "message": "Theme file saved and built successfully.",
        }

    except HTTPException:
        raise
    except RuntimeError as e:
        # Build validation failed — nothing was committed
        error_msg = str(e)
        if len(error_msg) > 5000:
            error_msg = error_msg[:5000] + "\n... (truncated)"
        logger.error(f"Theme build validation failed: {error_msg[:500]}")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Build failed. No changes were saved.\n\n{error_msg}",
        )
    except Exception as e:
        logger.error(f"Error saving theme file: {e}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save theme file: {str(e)}",
        )
    finally:
        release_build_lock(lock_conn)
        if temp_dir:
            shutil.rmtree(temp_dir, ignore_errors=True)


@router.delete("/file/{theme_name}/{file_path:path}")
def delete_theme_file(
    theme_name: str,
    file_path: str,
    background_tasks: BackgroundTasks,
    current_user: UserModel = Depends(check_website_admin_role),
    db: Session = Depends(get_db),
):
    """
    Delete an org's theme file record (and its contents).

    Only DB-only files can be deleted — files that also exist in the theme
    source would simply reappear on the next reconcile, so resetting the theme
    is the right action for those.
    """
    current_org_id = getattr(current_user, "current_organization_id", None)
    if current_org_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="X-Organization-Id header required",
        )

    file_path = _validate_theme_file_path(file_path)

    if os.path.isfile(os.path.join(get_themes_dir(), theme_name, file_path)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"'{file_path}' exists in the theme source and cannot be deleted. "
                f"Reset the theme to discard your edits instead."
            ),
        )

    # Same advisory lock as save — a delete triggers the same rebuild path
    lock_conn = try_acquire_build_lock(db)
    if lock_conn is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A theme build is already in progress. Please try again shortly.",
        )

    try:
        ThemeFileModel = models_pool.get("theme_file")
        ThemeFileContentModel = models_pool.get("theme_file_content")

        theme_file = (
            db.query(ThemeFileModel)
            .filter(
                ThemeFileModel.theme_name == theme_name,
                ThemeFileModel.file_path == file_path,
                ThemeFileModel.organization_id == current_org_id,
            )
            .first()
        )
        if not theme_file:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"File not found: {file_path}",
            )

        # Contents first (FK constraint)
        db.query(ThemeFileContentModel).filter(
            ThemeFileContentModel.theme_file_id == theme_file.id
        ).delete(synchronize_session=False)
        db.query(ThemeFileModel).filter(ThemeFileModel.id == theme_file.id).delete(
            synchronize_session=False
        )
        db.commit()

        if settings.NO_CLIENT:
            # Dev mode: reconcile drops the file from the overlay tree (it no
            # longer exists in the DB nor in the base theme) and themes.ts is
            # regenerated without its import.
            from ..utils.setup_themes import reconcile_theme_overlays
            from ..utils.theme_imports import (
                generate_theme_imports,
                generate_tailwind_config,
            )

            reconcile_theme_overlays(PROJECT_ROOT, force=True)
            generate_theme_imports(
                data_dir_path=PROJECT_ROOT, selected_theme=theme_name
            )
            generate_tailwind_config(
                data_dir_path=PROJECT_ROOT, selected_theme=theme_name
            )
        else:
            # Production: force_sync so the removed file is pruned from the
            # data dir before the rebuild.
            background_tasks.add_task(
                trigger_setup_themes,
                force_sync=True,
                selected_theme=theme_name,
            )

        logger.info(f"Deleted theme file: {theme_name}/{file_path}")

        return {
            "success": True,
            "message": f"Theme file '{file_path}' deleted.",
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting theme file: {e}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete theme file: {str(e)}",
        )
    finally:
        release_build_lock(lock_conn)
