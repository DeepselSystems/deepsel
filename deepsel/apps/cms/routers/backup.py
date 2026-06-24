import logging
import csv
import json
import io
import zipfile
import tempfile
import shutil
import os
from fastapi import Depends, HTTPException, status, UploadFile, Form, APIRouter
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from deepsel.deps import get_db, get_current_user, settings
from deepsel.utils.models_pool import models_pool
from deepsel.utils.install_apps import import_csv_data

logger = logging.getLogger(__name__)

router = APIRouter(prefix=f"{settings.API_PREFIX}/backup", tags=["Backup"])
UserModel = models_pool["user"]


@router.get("/export")
def export_backup(
    organization_id: int,
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
):
    """
    Export backup for the specified organization.
    Returns a ZIP file containing CSVs for Pages, Blog Posts, Menus, Attachments and the attachment files.
    """
    if not any(
        role.string_id in ["admin_role", "website_admin_role"] for role in user.roles
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to export backup",
        )

    is_admin = any(role.string_id == "admin_role" for role in user.roles)
    if not is_admin and organization_id not in user.get_org_ids():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this organization",
        )

    org_id = organization_id

    # Helper to generate string_id if missing
    def ensure_string_id(record, model_name):
        if not record.string_id:
            return f"{model_name}_{record.id}"
        return record.string_id

    # Helper to write model data to CSV in ZIP
    def write_model_csv(zip_file, model_name, records, fieldnames, extra_fields=None):
        if not records:
            return

        csv_buffer = io.StringIO()
        writer = csv.DictWriter(csv_buffer, fieldnames=fieldnames)
        writer.writeheader()

        for record in records:
            row = {}
            for field in fieldnames:
                if field == "string_id":
                    row[field] = ensure_string_id(record, model_name)
                elif extra_fields and field in extra_fields:
                    row[field] = extra_fields[field](record)
                elif hasattr(record, field):
                    val = getattr(record, field)
                    # Handle boolean values
                    if isinstance(val, bool):
                        row[field] = str(val).lower()
                    else:
                        row[field] = val
            writer.writerow(row)

        zip_file.writestr(f"{model_name}.csv", csv_buffer.getvalue())

    # Create ZIP in memory
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        # 1. Export Pages
        PageModel = models_pool["page"]
        pages = db.query(PageModel).filter_by(organization_id=org_id).all()

        page_fields = [
            "string_id",
            "is_homepage",
            "require_login",
            "page_custom_code",
            "published",
        ]
        write_model_csv(zip_file, "page", pages, page_fields)

        # Export PageContent
        PageContentModel = models_pool["page_content"]
        # Filter page contents where page belongs to org
        page_contents = (
            db.query(PageContentModel)
            .join(PageModel)
            .filter(PageModel.organization_id == org_id)
            .all()
        )

        # Need to link back to page using string_id
        def get_page_string_id(record):
            return ensure_string_id(record.page, "page")

        def get_locale_string_id(record):
            return record.locale.string_id if record.locale else "en"

        page_content_fields = [
            "string_id",
            "title",
            "slug",
            "json:content",
            "page/page_id",  # Link to page via page_id foreign key
            "locale/locale_id",  # Link to locale via locale_id foreign key
            "seo_metadata_title",
            "seo_metadata_description",
            "attachment/seo_metadata_featured_image_id",
            "seo_metadata_allow_indexing",
            "custom_code",
            "published",
            "last_modified_at",
        ]

        def get_seo_featured_image_string_id(record):
            return (
                ensure_string_id(record.seo_metadata_featured_image, "attachment")
                if record.seo_metadata_featured_image
                else ""
            )

        write_model_csv(
            zip_file,
            "page_content",
            page_contents,
            page_content_fields,
            extra_fields={
                "page/page_id": get_page_string_id,
                "locale/locale_id": get_locale_string_id,
                "json:content": lambda r: json.dumps(r.content) if r.content else "[]",
                "attachment/seo_metadata_featured_image_id": get_seo_featured_image_string_id,
            },
        )

        # 2. Export Blog Posts
        BlogPostModel = models_pool["blog_post"]
        blog_posts = db.query(BlogPostModel).filter_by(organization_id=org_id).all()
        blog_post_fields = [
            "string_id",
            "slug",
            "published",
            "publish_date",
            "require_login",
            "blog_post_custom_code",
            # "author_id", # Skip author to avoid user dependency issues
        ]
        write_model_csv(zip_file, "blog_post", blog_posts, blog_post_fields)

        # Export BlogPostContent
        BlogPostContentModel = models_pool["blog_post_content"]
        blog_post_contents = (
            db.query(BlogPostContentModel)
            .join(BlogPostModel)
            .filter(BlogPostModel.organization_id == org_id)
            .all()
        )

        def get_post_string_id(record):
            return ensure_string_id(record.post, "blog_post")

        blog_post_content_fields = [
            "string_id",
            "title",
            "subtitle",
            "content",  # BlogPostContent.content is Text, not JSON
            "reading_length",
            "blog_post/post_id",  # Link to blog_post via post_id foreign key
            "locale/locale_id",  # Link to locale via locale_id foreign key
            "attachment/featured_image_id",
            "seo_metadata_title",
            "seo_metadata_description",
            "attachment/seo_metadata_featured_image_id",
            "seo_metadata_allow_indexing",
            "published",
            "last_modified_at",
        ]

        def get_featured_image_string_id(record):
            return (
                ensure_string_id(record.featured_image, "attachment")
                if record.featured_image
                else ""
            )

        def get_blog_seo_featured_image_string_id(record):
            return (
                ensure_string_id(record.seo_metadata_featured_image, "attachment")
                if record.seo_metadata_featured_image
                else ""
            )

        write_model_csv(
            zip_file,
            "blog_post_content",
            blog_post_contents,
            blog_post_content_fields,
            extra_fields={
                "blog_post/post_id": get_post_string_id,
                "locale/locale_id": get_locale_string_id,
                "attachment/featured_image_id": get_featured_image_string_id,
                "attachment/seo_metadata_featured_image_id": get_blog_seo_featured_image_string_id,
            },
        )

        # 3. Export PageContent Revisions
        PageContentRevisionModel = models_pool["page_content_revision"]
        page_content_revisions = (
            db.query(PageContentRevisionModel).filter_by(organization_id=org_id).all()
        )

        def get_page_content_string_id_for_revision(record):
            return ensure_string_id(record.page_content, "page_content")

        page_content_revision_fields = [
            "string_id",
            "name",
            "revision_number",
            "page_content/page_content_id",
            "old_content",
            "new_content",
        ]

        write_model_csv(
            zip_file,
            "page_content_revision",
            page_content_revisions,
            page_content_revision_fields,
            extra_fields={
                "page_content/page_content_id": get_page_content_string_id_for_revision
            },
        )

        # 4. Export BlogPostContent Revisions
        BlogPostContentRevisionModel = models_pool["blog_post_content_revision"]
        blog_post_content_revisions = (
            db.query(BlogPostContentRevisionModel)
            .filter_by(organization_id=org_id)
            .all()
        )

        def get_blog_post_content_string_id_for_revision(record):
            return ensure_string_id(record.blog_post_content, "blog_post_content")

        blog_post_content_revision_fields = [
            "string_id",
            "name",
            "revision_number",
            "blog_post_content/blog_post_content_id",
            "old_content",
            "new_content",
        ]

        write_model_csv(
            zip_file,
            "blog_post_content_revision",
            blog_post_content_revisions,
            blog_post_content_revision_fields,
            extra_fields={
                "blog_post_content/blog_post_content_id": get_blog_post_content_string_id_for_revision
            },
        )

        # 5. Export Menus
        MenuModel = models_pool["menu"]
        menus = db.query(MenuModel).filter_by(organization_id=org_id).all()

        # Handle parent/child relationship
        def get_parent_string_id(record):
            return ensure_string_id(record.parent, "menu") if record.parent else ""

        menu_fields = [
            "string_id",
            "position",
            "open_in_new_tab",
            "menu/parent_id",  # Parent link via parent_id foreign key
            "json:translations",  # Menu uses JSON for translations
        ]

        # Need to serialize translations dict to JSON string
        # Also add page_content_string_id alongside page_content_id for portability
        def get_translations_json(record):
            if not record.translations:
                return "{}"

            # Handle case where translations might be a string (already JSON-serialized)
            # or a dictionary
            translations_data = record.translations
            if isinstance(translations_data, str):
                try:
                    translations_data = json.loads(translations_data)
                except json.JSONDecodeError:
                    logger.error(
                        f"Failed to parse translations JSON for menu {record.id}"
                    )
                    return "{}"

            if not isinstance(translations_data, dict):
                logger.error(
                    f"Unexpected translations type for menu {record.id}: {type(translations_data)}"
                )
                return "{}"

            PageContentModel = models_pool.get("page_content")
            translations_copy = {}

            for locale, data in translations_data.items():
                translations_copy[locale] = (
                    data.copy() if isinstance(data, dict) else data
                )
                # If this translation has a page_content_id, add the string_id too
                if (
                    isinstance(translations_copy[locale], dict)
                    and "page_content_id" in translations_copy[locale]
                    and translations_copy[locale]["page_content_id"]
                ):
                    page_content_id = translations_copy[locale]["page_content_id"]
                    page_content = (
                        db.query(PageContentModel).filter_by(id=page_content_id).first()
                    )
                    if page_content and page_content.string_id:
                        # Add string_id alongside the integer ID
                        translations_copy[locale][
                            "page_content_string_id"
                        ] = page_content.string_id

            return json.dumps(translations_copy)

        write_model_csv(
            zip_file,
            "menu",
            menus,
            menu_fields,
            extra_fields={
                "menu/parent_id": get_parent_string_id,
                "json:translations": get_translations_json,
            },
        )

        # 4. Export Attachments
        AttachmentModel = models_pool["attachment"]
        attachments = db.query(AttachmentModel).filter_by(organization_id=org_id).all()

        attachment_fields = [
            "string_id",
            "name",
            "alt_text",
            "content_type",
            "file:file_path",  # Special column for file import
        ]

        def get_zip_file_path(record):
            # We'll store files in 'attachments/' folder in zip
            # Use original filename or name
            filename = os.path.basename(record.name)
            return f"attachments/{filename}"

        write_model_csv(
            zip_file,
            "attachment",
            attachments,
            attachment_fields,
            extra_fields={"file:file_path": get_zip_file_path},
        )

        # Add attachment files to ZIP
        for attachment in attachments:
            try:
                file_data = attachment.get_data()
                filename = os.path.basename(attachment.name)
                zip_file.writestr(f"attachments/{filename}", file_data)
            except Exception as e:
                logger.error(f"Failed to export attachment {attachment.id}: {e}")
                # Continue even if one file fails? Yes.

    zip_buffer.seek(0)
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=backup.zip"},
    )


@router.post("/import")
def import_backup(
    file: UploadFile,
    organization_id: int = Form(...),
    db: Session = Depends(get_db),
    user: UserModel = Depends(get_current_user),
):
    """
    Import backup from ZIP file.
    Extracts ZIP and imports CSVs for Pages, Blog Posts, Menus, Attachments.
    """
    # Increase CSV field size limit to handle large content fields
    # Default is 131072 (128KB), which is too small for rich page content
    csv.field_size_limit(10485760)  # 10MB limit

    if not any(
        role.string_id in ["admin_role", "website_admin_role"] for role in user.roles
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to import backup",
        )

    is_admin = any(role.string_id == "admin_role" for role in user.roles)
    if not is_admin and organization_id not in user.get_org_ids():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this organization",
        )

    org_id = organization_id

    if not file.filename.endswith(".zip"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be a ZIP archive",
        )

    # Create temp directory
    with tempfile.TemporaryDirectory() as temp_dir:
        try:
            # Save uploaded file
            zip_path = os.path.join(temp_dir, "backup.zip")
            with open(zip_path, "wb") as f:
                shutil.copyfileobj(file.file, f)

            # Extract ZIP
            with zipfile.ZipFile(zip_path, "r") as zip_ref:
                zip_ref.extractall(temp_dir)

            # Import order matters due to dependencies
            import_files = [
                "attachment.csv",
                "page.csv",
                "page_content.csv",
                "page_content_revision.csv",
                "blog_post.csv",
                "blog_post_content.csv",
                "blog_post_content_revision.csv",
                "menu.csv",
            ]

            results = {"success": [], "errors": []}

            # Wrap entire import in a transaction for data integrity
            # If any error occurs, all changes will be rolled back
            try:
                for filename in import_files:
                    csv_path = os.path.join(temp_dir, filename)
                    if os.path.exists(csv_path):
                        logger.info(f"Importing {filename}...")

                        # Preprocess CSV to add organization_id and owner_id
                        try:
                            rows = []
                            fieldnames = []
                            with open(csv_path, "r", encoding="utf-8") as f:
                                reader = csv.DictReader(f)
                                fieldnames = (
                                    list(reader.fieldnames) if reader.fieldnames else []
                                )
                                rows = list(reader)

                            if rows:
                                if "organization_id" not in fieldnames:
                                    fieldnames.append("organization_id")
                                if "owner_id" not in fieldnames:
                                    fieldnames.append("owner_id")

                                # Add user/owner_id to fieldnames (empty) to prevent orm.py from defaulting to system user
                                # The OR condition in orm.py requires BOTH user/owner_id AND owner_id to be present
                                if "user/owner_id" not in fieldnames:
                                    fieldnames.append("user/owner_id")

                                # For blog_post.csv, handle author_id
                                if filename == "blog_post.csv":
                                    if "author_id" not in fieldnames:
                                        fieldnames.append("author_id")
                                    if "user/author_id" not in fieldnames:
                                        fieldnames.append("user/author_id")

                                for row in rows:
                                    row["organization_id"] = org_id
                                    row["owner_id"] = user.id
                                    # Set user/owner_id to empty string (presence in fieldnames prevents system user default)
                                    row["user/owner_id"] = ""

                                    if filename == "blog_post.csv":
                                        row["author_id"] = user.id
                                        row["user/author_id"] = ""

                                # Debug logging
                                if rows:
                                    logger.info(
                                        f"Preprocessing {filename}: user.id={user.id}, org_id={org_id}"
                                    )
                                    logger.info(
                                        f"First row after preprocessing: {rows[0]}"
                                    )
                                    logger.info(f"Fieldnames: {fieldnames}")

                                with open(
                                    csv_path, "w", encoding="utf-8", newline=""
                                ) as f:
                                    writer = csv.DictWriter(f, fieldnames=fieldnames)
                                    writer.writeheader()
                                    writer.writerows(rows)
                        except Exception as e:
                            logger.error(f"Error preprocessing {filename}: {e}")
                            raise  # Re-raise to trigger rollback

                        # Import CSV without auto-commit to maintain transaction integrity
                        import_csv_data(
                            csv_path,
                            db,
                            demo_data=False,
                            organization_id=org_id,
                            base_dir=temp_dir,
                            force_update=True,
                            auto_commit=False,  # CRITICAL: Disable auto-commit
                        )
                        results["success"].append(filename)

                # Post-process menus to update page_content_id references
                logger.info(
                    "Post-processing menus to update page_content_id references..."
                )
                MenuModel = models_pool.get("menu")
                PageContentModel = models_pool.get("page_content")

                menus = db.query(MenuModel).filter_by(organization_id=org_id).all()
                for menu in menus:
                    if not menu.translations:
                        continue

                    updated = False
                    for locale, data in menu.translations.items():
                        # If this translation has page_content_string_id, look up the actual ID
                        if (
                            "page_content_string_id" in data
                            and data["page_content_string_id"]
                        ):
                            string_id = data["page_content_string_id"]
                            page_content = (
                                db.query(PageContentModel)
                                .filter_by(string_id=string_id, organization_id=org_id)
                                .first()
                            )

                            if page_content:
                                # Update the page_content_id with the correct ID from this database
                                menu.translations[locale][
                                    "page_content_id"
                                ] = page_content.id
                                updated = True
                                logger.debug(
                                    f"Updated menu {menu.string_id} locale {locale}: page_content_id = {page_content.id}"
                                )

                    if updated:
                        # Mark the translations field as modified so SQLAlchemy knows to update it
                        from sqlalchemy.orm.attributes import flag_modified

                        flag_modified(menu, "translations")

                logger.info("Menu post-processing complete")

                # COMMIT EVERYTHING AT ONCE - only if all imports succeeded
                db.commit()
                logger.info(
                    "Backup import completed successfully - all changes committed"
                )

            except Exception as e:
                # ROLLBACK ALL CHANGES if any error occurred
                db.rollback()
                logger.error(f"Backup import failed, rolling back all changes: {e}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Backup import failed: {str(e)}. All changes have been rolled back.",
                )

            return results

        except Exception as e:
            logger.error(f"Backup import failed: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Backup import failed: {str(e)}",
            )
