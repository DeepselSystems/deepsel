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
    UploadFile,
    File,
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

logger = logging.getLogger(__name__)

UserModel = models_pool["user"]

STATE_FILENAME = ".theme_state.json"
DATA_DIR = user_data_dir("deepsel-cms", "deepsel")
THEMES_DIR = os.path.join(DATA_DIR, "themes")
SOURCE_THEMES_DIR = os.path.join(
    os.path.dirname(__file__), "..", "..", "..", "..", "themes"
)

router = APIRouter(prefix=f"{settings.API_PREFIX}/theme", tags=["Theme"])


def get_themes_dir() -> str:
    """Return the themes directory path, using data_dir if available, else source."""
    data_dir = user_data_dir("deepsel-cms", "deepsel")
    data_themes = os.path.join(data_dir, "themes")
    if os.path.exists(data_themes):
        return data_themes
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
    """Find a theme's directory, checking data dir first then source dir."""
    for base in (THEMES_DIR, os.path.normpath(SOURCE_THEMES_DIR)):
        path = os.path.join(base, folder_name)
        if os.path.isdir(path):
            return path
    return None


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
    List all available themes from both the source themes/ folder
    and the data directory. Source themes take priority.
    """
    try:
        # Scan both directories and merge (source themes take priority)
        themes_dict = _scan_themes_in_dir(THEMES_DIR)
        source_themes = _scan_themes_in_dir(os.path.normpath(SOURCE_THEMES_DIR))
        themes_dict.update(source_themes)

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


REQUIRED_THEME_FILES = {"page.astro", "package.json", "theme.json"}


@router.post("/upload")
def upload_theme(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    current_user: UserModel = Depends(check_website_admin_role),
):
    """Upload a new theme as a .zip archive."""
    if not file.filename or not file.filename.endswith(".zip"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be a .zip archive",
        )

    try:
        contents = file.file.read()
        zf = zipfile.ZipFile(io.BytesIO(contents))
    except zipfile.BadZipFile:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid zip file",
        )

    def _is_macos_artifact(name: str) -> bool:
        # macOS-created zips include __MACOSX/ resource-fork entries and
        # ._-prefixed AppleDouble files. Ignore them everywhere.
        if name.startswith("__MACOSX/") or "/__MACOSX/" in name:
            return True
        return os.path.basename(name).startswith("._")

    # Security: check for path traversal
    for name in zf.namelist():
        if _is_macos_artifact(name):
            continue
        if name.startswith("/") or ".." in name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid path in zip: {name}",
            )

    # Determine if files are inside a single top-level folder or at root
    top_level_dirs = set()
    top_level_files = set()
    for name in zf.namelist():
        if _is_macos_artifact(name):
            continue
        parts = name.split("/")
        if len(parts) > 1 and parts[1]:
            top_level_dirs.add(parts[0])
        elif not name.endswith("/"):
            top_level_files.add(parts[0])

    # If all files are inside a single folder, strip that prefix
    prefix = ""
    if len(top_level_dirs) == 1 and not top_level_files:
        prefix = list(top_level_dirs)[0] + "/"

    # Validate required files exist
    zip_files = set()
    for name in zf.namelist():
        if name.endswith("/") or _is_macos_artifact(name):
            continue
        relative = name[len(prefix) :] if prefix else name
        zip_files.add(relative)

    missing = REQUIRED_THEME_FILES - zip_files
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Theme is missing required files: {', '.join(sorted(missing))}",
        )

    # Read theme.json to get folder name
    theme_json_path = prefix + "theme.json"
    try:
        theme_meta = json.loads(zf.read(theme_json_path))
    except (KeyError, json.JSONDecodeError) as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid theme.json: {e}",
        )

    # Use folder_name from theme.json, fall back to zip folder name or filename
    folder_name = theme_meta.get("folder_name") or (
        prefix.rstrip("/") if prefix else os.path.splitext(file.filename)[0]
    )
    # Sanitize folder name
    folder_name = folder_name.replace("/", "").replace("\\", "").replace("..", "")
    if not folder_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not determine theme folder name",
        )

    # Check if theme already exists
    source_dir = os.path.normpath(SOURCE_THEMES_DIR)
    target_path = os.path.join(source_dir, folder_name)
    if os.path.exists(target_path):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Theme '{folder_name}' already exists",
        )

    # Extract to source themes directory
    os.makedirs(target_path, exist_ok=True)
    for name in zf.namelist():
        if name.endswith("/") or _is_macos_artifact(name):
            continue
        relative = name[len(prefix) :] if prefix else name
        if not relative:
            continue
        dest = os.path.join(target_path, relative)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(dest, "wb") as f:
            f.write(zf.read(name))

    logger.info(
        f"Theme '{folder_name}' uploaded by {current_user.email or current_user.username}"
    )

    # Trigger theme setup in background
    background_tasks.add_task(trigger_setup_themes)

    return {
        "success": True,
        "message": f"Theme '{folder_name}' uploaded successfully. Build started in background.",
        "folder_name": folder_name,
    }


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

            project_root = os.path.normpath(
                os.path.join(os.path.dirname(__file__), "..", "..", "..", "..")
            )
            generate_theme_imports(
                data_dir_path=project_root, selected_theme=request.folder_name
            )
            generate_tailwind_config(
                data_dir_path=project_root, selected_theme=request.folder_name
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

        # Clean up language-variant folders in source themes dir (still global —
        # language base files are shared, language-specific org overlays live
        # under themes/org_<id>/<lang>/<theme>/ and are cleared by reconcile)
        source_dir = os.path.normpath(SOURCE_THEMES_DIR)
        if os.path.exists(source_dir):
            for entry in os.listdir(source_dir):
                lang_theme_path = os.path.join(source_dir, entry, request.folder_name)
                if (
                    entry != request.folder_name
                    and not entry.startswith("org_")
                    and os.path.isdir(os.path.join(source_dir, entry))
                    and os.path.isdir(lang_theme_path)
                ):
                    shutil.rmtree(lang_theme_path, ignore_errors=True)
                    logger.info(
                        f"Removed language variant: {entry}/{request.folder_name}"
                    )

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


@router.get("/files/{theme_name}", response_model=list[ThemeFileNode])
def list_theme_files(
    theme_name: str, current_user: UserModel = Depends(check_website_admin_role)
):
    """
    List all files in a theme as a tree structure
    """
    theme_path = os.path.join(get_themes_dir(), theme_name)

    if not theme_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Theme '{theme_name}' not found",
        )

    return build_file_tree(theme_path)


@router.get("/file/{theme_name}/{file_path:path}")
def get_theme_file(
    theme_name: str,
    file_path: str,
    current_user: UserModel = Depends(check_website_admin_role),
    db: Session = Depends(get_db),
):
    """
    Get a theme file content. Returns both filesystem content and any saved DB versions.
    """
    current_org_id = getattr(current_user, "current_organization_id", None)
    if current_org_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="X-Organization-Id header required",
        )

    try:
        ThemeFileModel = models_pool.get("theme_file")

        # Read default file from filesystem
        full_path = os.path.join(get_themes_dir(), theme_name, file_path)

        if not os.path.exists(full_path):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"File not found: {file_path}",
            )

        with open(full_path, "r", encoding="utf-8") as f:
            default_content = f.read()

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

        return {"theme_name": theme_name, "file_path": file_path, "contents": contents}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting theme file: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get theme file: {str(e)}",
        )


THEME_BUILD_LOCK_ID = 748329  # Arbitrary constant for PG advisory lock


def try_acquire_build_lock(db: Session) -> bool:
    """Try to acquire PG advisory lock. Returns True if acquired."""
    result = db.execute(
        text("SELECT pg_try_advisory_lock(:id)"), {"id": THEME_BUILD_LOCK_ID}
    )
    return result.scalar()


def release_build_lock(db: Session):
    """Release PG advisory lock."""
    db.execute(text("SELECT pg_advisory_unlock(:id)"), {"id": THEME_BUILD_LOCK_ID})


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
    if not try_acquire_build_lock(db):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A theme build is already in progress. Please try again shortly.",
        )

    current_org_id = getattr(current_user, "current_organization_id", None)
    if current_org_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="X-Organization-Id header required",
        )

    temp_dir = None
    try:
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

        # Process each content version
        for content_data in request.contents:
            lang_code = content_data.lang_code

            if content_data.id:
                db_content = (
                    db.query(ThemeFileContentModel)
                    .filter(ThemeFileContentModel.id == content_data.id)
                    .first()
                )
                if db_content:
                    db_content.content = content_data.content
                    db_content.lang_code = lang_code
                    db_content.locale_id = content_data.locale_id
            else:
                db_content = ThemeFileContentModel(
                    content=content_data.content,
                    lang_code=lang_code,
                    locale_id=content_data.locale_id,
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

            project_root = os.path.normpath(
                os.path.join(os.path.dirname(__file__), "..", "..", "..", "..")
            )
            reconcile_theme_overlays(project_root, force=True)
            generate_theme_imports(
                data_dir_path=project_root, selected_theme=request.theme_name
            )
            generate_tailwind_config(
                data_dir_path=project_root, selected_theme=request.theme_name
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
        release_build_lock(db)
        if temp_dir:
            shutil.rmtree(temp_dir, ignore_errors=True)
