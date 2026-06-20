"""Theme setup utility - handles cloning, syncing, reconciling, and building themes."""

import importlib.util
import json
import os
import shutil
import tempfile

import subprocess  # nosec B404
import time
import logging
import hashlib

from deepsel.utils.install_apps import import_csv_data
from deepsel.utils.models_pool import models_pool
from deepsel.deps import get_db_context, settings
from .hash_utils import hash_file, hash_directory, hash_theme_files
from .state_utils import load_setup_state, save_setup_state
from .theme_imports import generate_theme_imports, generate_tailwind_config
from .theme_language import ensure_language_theme_exists
from .sync_utils import sync_directory
from .theme_overlay import (
    cleanup_stale_org_overlays,
    cleanup_stale_org_themes,
    ensure_org_theme_clone,
    org_theme_dir,
    rewrite_data_theme_in_tree,
)
from platformdirs import user_data_dir
from traceback import print_exc

logger = logging.getLogger(__name__)

STATE_FILENAME = ".theme_state.json"
LOCAL_PACKAGES = (
    settings.LOCAL_PACKAGES
    if settings and settings.LOCAL_PACKAGES
    else os.getenv("LOCAL_PACKAGES", "").lower() in ("true", "1")
)


def _get_user_shell():
    return (
        settings.SHELL if settings and settings.SHELL else os.getenv("SHELL", "/bin/sh")
    )


def _run_npm(cmd, cwd, timeout=300):
    """Run npm command through user's interactive shell to inherit PATH."""
    user_shell = _get_user_shell()
    return subprocess.run(  # nosec B603
        [user_shell, "-i", "-c", cmd],
        cwd=cwd,
        capture_output=True,
        text=True,
        timeout=timeout,
    )


def reconcile_theme_overlays(data_dir, force=False, previous_db_hash=None):
    """Materialize per-org theme overlays on disk and return (db_hash, did_sync).

    For each (org, theme) pair that has any ``theme_file`` rows:
      1. Mirror the base theme into ``themes/org_<id>/<theme>/`` (and the
         language variant tree when needed).
      2. Write each row's content into the overlay (DB is source of truth).
      3. Rewrite ``data-theme="<theme>"`` → ``data-theme="<theme>__<id>"`` in
         every .astro file under the overlay so the PostCSS per-theme dispatch
         produces a matching CSS scope.

    Stale ``themes/org_*/`` directories whose orgs/themes/langs no longer have
    rows in the DB are removed regardless of ``force``.

    ``previous_db_hash`` lets callers skip the actual file writes when the DB
    hasn't changed; pruning still runs.
    """
    with get_db_context() as db:
        ThemeFileModel = models_pool.get("theme_file")
        theme_files = db.query(ThemeFileModel).all()

        if not theme_files:
            cleanup_stale_org_overlays(data_dir, set())
            logger.info("No theme edits in database to reconcile")
            return None, False

        db_hash = hash_theme_files(theme_files)

        active_orgs: set[int] = set()
        active_themes_per_org: dict[int, set[str]] = {}
        active_langs_per_org_theme: dict[int, dict[str, set[str]]] = {}
        for tf in theme_files:
            active_orgs.add(tf.organization_id)
            active_themes_per_org.setdefault(tf.organization_id, set()).add(
                tf.theme_name
            )
            lang_map = active_langs_per_org_theme.setdefault(tf.organization_id, {})
            for content in tf.contents:
                if content.lang_code:
                    lang_map.setdefault(tf.theme_name, set()).add(content.lang_code)

        cleanup_stale_org_overlays(data_dir, active_orgs)
        for org_id, themes in active_themes_per_org.items():
            cleanup_stale_org_themes(
                data_dir,
                org_id,
                themes,
                active_langs_per_org_theme.get(org_id, {}),
            )

        if not force and previous_db_hash == db_hash:
            logger.info("Theme edits unchanged; skipping reconciliation")
            return db_hash, False

        for org_id, themes in active_themes_per_org.items():
            for theme_name in themes:
                ensure_org_theme_clone(data_dir, org_id, theme_name)
                for lang_code in active_langs_per_org_theme.get(org_id, {}).get(
                    theme_name, set()
                ):
                    ensure_language_theme_exists(
                        lang_code=lang_code,
                        theme_name=theme_name,
                        data_dir_path=data_dir,
                    )
                    ensure_org_theme_clone(data_dir, org_id, theme_name, lang_code)

        reconciled_count = 0
        for theme_file in theme_files:
            for content in theme_file.contents:
                if not content.content:
                    continue
                dest = os.path.join(
                    org_theme_dir(
                        data_dir,
                        theme_file.organization_id,
                        theme_file.theme_name,
                        content.lang_code,
                    ),
                    theme_file.file_path,
                )
                os.makedirs(os.path.dirname(dest), exist_ok=True)
                with open(dest, "w", encoding="utf-8") as f:
                    f.write(content.content)
                reconciled_count += 1

        rewrite_count = 0
        for org_id, themes in active_themes_per_org.items():
            for theme_name in themes:
                rewrite_count += rewrite_data_theme_in_tree(
                    org_theme_dir(data_dir, org_id, theme_name),
                    theme_name,
                    org_id,
                )
                for lang_code in active_langs_per_org_theme.get(org_id, {}).get(
                    theme_name, set()
                ):
                    rewrite_count += rewrite_data_theme_in_tree(
                        org_theme_dir(data_dir, org_id, theme_name, lang_code),
                        theme_name,
                        org_id,
                    )

        logger.info(
            f"Reconciled {reconciled_count} theme file overlays "
            f"({rewrite_count} data-theme rewrites) across "
            f"{len(active_orgs)} org(s)"
        )
        return db_hash, True


def build_in_dir(data_dir, run_install=True, run_build=True):
    """
    Run npm install and/or npm build in the given directory.
    Raises RuntimeError on failure.
    """
    if run_install:
        logger.info("Running npm install...")
        install_result = _run_npm("npm install", cwd=data_dir)

        if install_result.returncode != 0:
            error_output = install_result.stdout + "\n" + install_result.stderr
            logger.error(f"npm install failed: {error_output}")
            raise RuntimeError(
                f"npm install failed with exit code {install_result.returncode}: {error_output}"
            )
        else:
            logger.info("npm install completed successfully")
    else:
        logger.info("Dependencies unchanged; skipping npm install")

    if run_build:
        logger.info("Running client build...")
        build_result = _run_npm("npm run build", cwd=data_dir, timeout=600)

        if build_result.returncode != 0:
            error_output = build_result.stdout + "\n" + build_result.stderr
            logger.error(f"Client build failed: {error_output}")
            raise RuntimeError(
                f"npm build failed with exit code {build_result.returncode}: {error_output}"
            )
        else:
            logger.info("Client build completed successfully")
    else:
        logger.info("Build artifacts up to date; skipping client build")


def validate_theme_build(theme_name, file_path, contents, organization_id):
    """
    Build theme in an isolated temp directory to validate changes
    without modifying the live site or database.

    The pending edit is written into the org's overlay tree
    (``themes/org_<id>/<theme_name>/...``) inside the temp dir so the build
    mirrors what reconcile will produce on commit. The base theme is cloned
    into the overlay first (matching :func:`ensure_org_theme_clone`) and
    every .astro has its ``data-theme`` attribute rewritten to
    ``<theme_name>__<organization_id>``.

    Args:
        theme_name: Name of the theme being edited
        file_path: Relative path of the file within the theme
        contents: List of content objects with content, lang_code attributes
        organization_id: Org performing the edit (used for the overlay path)

    Returns:
        Path to temp directory on success (caller must clean up).

    Raises:
        RuntimeError on build failure.
    """
    data_dir = user_data_dir("deepsel-cms", "deepsel")
    temp_dir = tempfile.mkdtemp(prefix="theme_build_")

    try:
        themes_src = os.path.join(data_dir, "themes")
        client_src = os.path.join(data_dir, "client")
        node_modules_src = os.path.join(data_dir, "node_modules")

        # Copy themes (small text files)
        if os.path.exists(themes_src):
            shutil.copytree(themes_src, os.path.join(temp_dir, "themes"))

        # Copy client (exclude dist/ and .astro/ cache)
        if os.path.exists(client_src):
            shutil.copytree(
                client_src,
                os.path.join(temp_dir, "client"),
                ignore=shutil.ignore_patterns("dist", ".astro"),
            )

        # Copy package.json
        pkg_json = os.path.join(data_dir, "package.json")
        if os.path.exists(pkg_json):
            shutil.copy2(pkg_json, os.path.join(temp_dir, "package.json"))

        # Symlink node_modules (read-only, shared — avoids copying hundreds of MB)
        if os.path.exists(node_modules_src):
            os.symlink(node_modules_src, os.path.join(temp_dir, "node_modules"))

        # Ensure the org overlay tree exists in the temp dir for this theme
        # (and for any language the edit targets).
        lang_codes_in_edit = {c.lang_code for c in contents if c.lang_code}
        ensure_org_theme_clone(temp_dir, organization_id, theme_name)
        for lang_code in lang_codes_in_edit:
            ensure_language_theme_exists(
                lang_code=lang_code,
                theme_name=theme_name,
                data_dir_path=temp_dir,
            )
            ensure_org_theme_clone(temp_dir, organization_id, theme_name, lang_code)

        # Write new file content into the org's overlay tree
        for content_data in contents:
            dest_path = os.path.join(
                org_theme_dir(
                    temp_dir, organization_id, theme_name, content_data.lang_code
                ),
                file_path,
            )
            os.makedirs(os.path.dirname(dest_path), exist_ok=True)
            with open(dest_path, "w", encoding="utf-8") as f:
                f.write(content_data.content)

        # Rewrite data-theme attribute for every .astro under the overlay so
        # the PostCSS per-theme dispatch produces a matching CSS scope.
        rewrite_data_theme_in_tree(
            org_theme_dir(temp_dir, organization_id, theme_name),
            theme_name,
            organization_id,
        )
        for lang_code in lang_codes_in_edit:
            rewrite_data_theme_in_tree(
                org_theme_dir(temp_dir, organization_id, theme_name, lang_code),
                theme_name,
                organization_id,
            )

        # Regenerate theme imports and tailwind config for the temp workspace
        generate_theme_imports(data_dir_path=temp_dir, selected_theme=theme_name)
        generate_tailwind_config(data_dir_path=temp_dir, selected_theme=theme_name)

        # Build (skip npm install — symlinked node_modules is already up to date)
        build_in_dir(temp_dir, run_install=False, run_build=True)

        return temp_dir

    except Exception:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise


def setup_themes(
    force_build=False, force_sync=False, selected_theme: str | None = None
):
    """
    Setup themes - idempotent function that can be called on server start or after file edits:
    1. Sync client and themes folders to data dir (only if source changed)
    2. If LOCAL_PACKAGES: also sync admin/, packages/, root workspace files,
       and build local packages (for development before packages are published)
    3. Reconcile files from DB (DB is source of truth for edited files)
    4. Run npm install (only if dependencies changed)
    5. Run npm build (only if inputs changed, or force_build=True)

    Args:
        force_build: If True, always run build regardless of hash checks
        force_sync: If True, force sync themes folder (used when language versions are deleted)
    """
    start_time = time.time()
    data_dir = user_data_dir("deepsel-cms", "deepsel")
    logger.info(
        f"Setting up themes with data dir {data_dir} "
        f"(LOCAL_PACKAGES={'on' if LOCAL_PACKAGES else 'off'})"
    )

    try:
        client_path = "../client"
        client_build_path = os.path.join(data_dir, "client")

        state_path = os.path.join(data_dir, STATE_FILENAME)
        previous_state = load_setup_state(state_path)

        if not os.path.exists(client_path):
            logger.warning(
                f"Client path {client_path} does not exist, aborting theme setup"
            )
            return

        # Create client_build if it doesn't exist
        if not os.path.exists(client_build_path):
            logger.info(f"Creating {client_build_path} directory...")
            os.makedirs(client_build_path, exist_ok=True)

        # When not using local packages, replace the root package.json
        # with a minimal workspace config (client + themes only) and
        # clean up stale admin/packages directories
        if not LOCAL_PACKAGES:
            minimal_root = {
                "name": "deepsel-cms-build",
                "private": True,
                "workspaces": ["client", "themes/*"],
                "scripts": {
                    "build": "npm run build --workspace=client",
                },
            }
            # Preserve overrides from the source workspace root so peer-dep
            # resolutions stay consistent inside the data-dir workspace
            source_root_pkg = "../package.json"
            if os.path.exists(source_root_pkg):
                with open(source_root_pkg) as f:
                    src_pkg = json.load(f)
                for key in ("overrides", "resolutions"):
                    if key in src_pkg:
                        minimal_root[key] = src_pkg[key]
            root_pkg_path = os.path.join(data_dir, "package.json")
            with open(root_pkg_path, "w") as f:
                json.dump(minimal_root, f, indent=2)
            # Don't copy root package-lock.json — it references stale
            # admin/packages workspaces that would cause npm to recreate them
            stale_lock = os.path.join(data_dir, "package-lock.json")
            if os.path.exists(stale_lock):
                os.remove(stale_lock)
            for stale_dir in ("admin", "packages"):
                stale_path = os.path.join(data_dir, stale_dir)
                if os.path.exists(stale_path):
                    shutil.rmtree(stale_path)
                    logger.info(f"Removed stale workspace directory {stale_dir}")

        # Directories to exclude from sync
        EXCLUDE_DIRS = {"node_modules", "dist", ".astro", ".git"}

        # Calculate hashes for core folders (always needed)
        package_lock_hash = hash_file(os.path.join(client_path, "package-lock.json"))
        themes_src = "../themes"
        themes_hash = hash_directory(themes_src)
        client_hash = hash_directory(client_path)

        need_themes_sync = (
            force_sync or previous_state.get("themes_hash") != themes_hash
        )
        need_client_sync = previous_state.get("client_hash") != client_hash

        # Hashes for local package development (only computed when needed)
        admin_hash = None
        packages_hash = None
        need_admin_sync = False
        need_packages_sync = False

        if LOCAL_PACKAGES:
            admin_src = "../admin"
            packages_src = "../packages"
            admin_hash = hash_directory(admin_src)
            packages_hash = hash_directory(packages_src)
            need_admin_sync = previous_state.get("admin_hash") != admin_hash
            need_packages_sync = previous_state.get("packages_hash") != packages_hash

        # Sync themes if changed
        if need_themes_sync and os.path.exists(themes_src):
            themes_dst = os.path.join(data_dir, "themes")
            os.makedirs(themes_dst, exist_ok=True)
            sync_directory(src=themes_src, dst=themes_dst, exclude_dirs=EXCLUDE_DIRS)
            logger.info("Themes folder changes synced successfully")
        else:
            logger.info("Themes folder unchanged; skipping sync")

        # Local packages: sync admin, root workspace files, and packages
        if LOCAL_PACKAGES:
            admin_src = "../admin"
            packages_src = "../packages"

            if need_admin_sync and os.path.exists(admin_src):
                admin_dst = os.path.join(data_dir, "admin")
                os.makedirs(admin_dst, exist_ok=True)
                sync_directory(src=admin_src, dst=admin_dst, exclude_dirs=EXCLUDE_DIRS)
                logger.info("Admin folder synced successfully")
            else:
                logger.info("Admin folder unchanged; skipping sync")

            # Sync root workspace files so npm workspaces resolve locally
            root_package_json = "../package.json"
            root_package_lock = "../package-lock.json"
            if os.path.exists(root_package_json):
                shutil.copy2(root_package_json, os.path.join(data_dir, "package.json"))
                logger.debug("Synced root package.json")
            if os.path.exists(root_package_lock):
                shutil.copy2(
                    root_package_lock, os.path.join(data_dir, "package-lock.json")
                )
                logger.debug("Synced root package-lock.json")

            # Sync and build packages if changed
            if need_packages_sync and os.path.exists(packages_src):
                logger.info("Packages folder changes detected; syncing...")
                packages_dst = os.path.join(data_dir, "packages")
                os.makedirs(packages_dst, exist_ok=True)
                sync_directory(
                    src=packages_src, dst=packages_dst, exclude_dirs=EXCLUDE_DIRS
                )
                logger.info("Packages folder synced successfully")

            # Install at workspace root when admin or packages changed
            if need_admin_sync or need_packages_sync:
                logger.info("Running workspace npm install...")
                install_result = _run_npm("npm install", cwd=data_dir)
                if install_result.returncode != 0:
                    error_output = install_result.stdout + "\n" + install_result.stderr
                    logger.error(f"Workspace npm install failed: {error_output}")
                    raise RuntimeError(f"Workspace npm install failed: {error_output}")
                logger.info("Workspace npm install completed")

            if need_packages_sync and os.path.exists(packages_src):
                # Build packages in dependency order
                packages_dst = os.path.join(data_dir, "packages")
                pkg_subfolders = [
                    sf
                    for sf in os.listdir(packages_dst)
                    if os.path.isdir(os.path.join(packages_dst, sf))
                    and os.path.exists(os.path.join(packages_dst, sf, "package.json"))
                ]
                pkg_names = set()
                for sf in pkg_subfolders:
                    pkg_json_path = os.path.join(packages_dst, sf, "package.json")
                    with open(pkg_json_path, "r") as f:
                        pkg_names.add(json.load(f).get("name", ""))

                def _local_dep_count(sf):
                    """Count how many sibling packages this package depends on."""
                    pkg_json_path = os.path.join(packages_dst, sf, "package.json")
                    with open(pkg_json_path, "r") as f:
                        pkg = json.load(f)
                    all_deps = {
                        **pkg.get("dependencies", {}),
                        **pkg.get("devDependencies", {}),
                    }
                    return sum(1 for d in all_deps if d in pkg_names)

                pkg_subfolders.sort(key=_local_dep_count)

                for subfolder in pkg_subfolders:
                    subfolder_path = os.path.join(packages_dst, subfolder)
                    build_result = _run_npm("npm run build", cwd=subfolder_path)
                    if build_result.returncode != 0:
                        error_output = build_result.stdout + "\n" + build_result.stderr
                        logger.error(
                            f"npm run build failed in {subfolder}: {error_output}"
                        )
                        raise RuntimeError(
                            f"npm run build failed in {subfolder}: {error_output}"
                        )
                    logger.info(f"npm run build completed in {subfolder}")
            else:
                logger.info("Packages folder unchanged; skipping sync")

            # Build admin library (depends on packages, so runs after them)
            if need_admin_sync or need_packages_sync:
                admin_dst = os.path.join(data_dir, "admin")
                if os.path.exists(admin_dst):
                    logger.info("Building admin library...")
                    admin_build = _run_npm("npm run build:lib", cwd=admin_dst)
                    if admin_build.returncode != 0:
                        error_output = admin_build.stdout + "\n" + admin_build.stderr
                        logger.error(f"Admin build:lib failed: {error_output}")
                        raise RuntimeError(f"Admin build:lib failed: {error_output}")
                    logger.info("Admin library build completed")

        # Sync client folder
        if need_client_sync:
            sync_directory(
                src=client_path, dst=client_build_path, exclude_dirs=EXCLUDE_DIRS
            )
            logger.info("Client folder synced successfully")
        else:
            logger.info("Client folder unchanged; skipping sync")

        # Reconcile files from DB (DB is source of truth for edited files).
        db_hash, _ = reconcile_theme_overlays(
            data_dir,
            force=need_themes_sync,
            previous_db_hash=previous_state.get("db_hash"),
        )

        # Generate theme imports and tailwind config for client_build (after sync and reconciliation)
        generate_theme_imports(data_dir_path=data_dir, selected_theme=selected_theme)
        generate_tailwind_config(data_dir_path=data_dir, selected_theme=selected_theme)

        # Determine if npm install is needed
        node_modules_path = os.path.join(data_dir, "node_modules")
        need_install = (
            not os.path.exists(node_modules_path)
            or previous_state.get("package_lock_hash") != package_lock_hash
            or need_themes_sync
        )

        # Compute composite build inputs hash
        build_inputs_hasher = hashlib.sha256()
        for value in (
            themes_hash,
            admin_hash,
            client_hash,
            db_hash,
            package_lock_hash,
        ):
            build_inputs_hasher.update((value or "none").encode("utf-8"))
        build_inputs_hash = build_inputs_hasher.hexdigest()

        dist_path = os.path.join(client_build_path, "dist")
        need_build = (
            force_build
            or need_themes_sync
            or need_client_sync
            or need_install
            or previous_state.get("build_inputs_hash") != build_inputs_hash
            or not os.path.exists(dist_path)
        )
        if LOCAL_PACKAGES:
            need_build = need_build or need_admin_sync or need_packages_sync

        # Run npm install + build via shared helper
        build_in_dir(data_dir, run_install=need_install, run_build=need_build)

        state_payload = {
            "themes_hash": themes_hash,
            "client_hash": client_hash,
            "db_hash": db_hash,
            "package_lock_hash": package_lock_hash,
            "build_inputs_hash": build_inputs_hash,
        }
        if LOCAL_PACKAGES:
            state_payload["admin_hash"] = admin_hash
            state_payload["packages_hash"] = packages_hash

        save_setup_state(state_path, state_payload)

        logger.info(f"Theme setup completed in {time.time() - start_time:.2f} seconds")

    except subprocess.TimeoutExpired as e:
        logger.error(f"Theme setup timed out: {e}")
        raise RuntimeError(f"Theme setup timed out after {e.timeout} seconds") from e
    except Exception as e:
        logger.error(f"Error during theme setup: {e}")
        print_exc()
        raise


def load_seed_data_for_theme(theme_name, db, organization_id):
    """Load CSV seed data and run post_install hook for a single theme.

    Called once when a theme is selected (not on every startup).
    """
    data_dir = os.path.join("../themes", theme_name, "data")
    if not os.path.isdir(data_dir):
        return

    # Determine import order
    init_path = os.path.join(data_dir, "__init__.py")
    module = None
    if os.path.exists(init_path):
        spec = importlib.util.spec_from_file_location(
            f"theme_data_{theme_name}", init_path
        )
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        import_order = getattr(module, "import_order", [])
    else:
        import_order = sorted(f for f in os.listdir(data_dir) if f.endswith(".csv"))

    for csv_file in import_order:
        csv_path = os.path.join(data_dir, csv_file)
        if os.path.exists(csv_path):
            try:
                import_csv_data(csv_path, db, organization_id=organization_id)
            except Exception as e:
                logger.error(f"Failed to load {csv_file} for {theme_name}: {e}")

    # Run post_install hook if defined in __init__.py
    if module:
        post_install = getattr(module, "post_install", None)
        if callable(post_install):
            try:
                post_install(db, organization_id)
            except Exception as e:
                logger.error(f"post_install failed for {theme_name}: {e}")

    logger.info(f"Loaded seed data for theme {theme_name}")
