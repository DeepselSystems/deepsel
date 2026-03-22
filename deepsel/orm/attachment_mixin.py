import enum
import logging
import os
import traceback
from io import BytesIO
from typing import Optional

from fastapi import HTTPException, status, UploadFile
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from deepsel.orm.types import DeleteResponse, PermissionAction
from deepsel.utils.filename import sanitize_filename, randomize_file_name

logger = logging.getLogger(__name__)


class AttachmentTypeOptions(enum.Enum):
    s3 = "s3"
    azure = "azure"
    local = "local"
    external = "external"


class AttachmentMixin:
    """
    Mixin providing file attachment CRUD with pluggable storage backends.

    Subclass must override these classmethods to provide settings:
        _get_storage_type() -> str                    - "s3", "azure", or "local"
        _get_s3_bucket() -> str                       - S3 bucket name
        _get_s3_credentials() -> dict                 - {"aws_access_key_id", "aws_secret_access_key", "region_name"}
        _get_azure_container() -> str                 - Azure container name
        _get_azure_connection_string() -> str          - Azure storage connection string
        _get_upload_size_limit() -> int               - max upload size in MB
    """

    local_directory = "files"
    _s3_client = None
    _azure_blob_client = None

    @classmethod
    def _get_storage_type(cls) -> str:
        raise NotImplementedError("Subclass must implement _get_storage_type()")

    @classmethod
    def _get_s3_bucket(cls) -> str:
        raise NotImplementedError("Subclass must implement _get_s3_bucket()")

    @classmethod
    def _get_s3_credentials(cls) -> dict:
        raise NotImplementedError("Subclass must implement _get_s3_credentials()")

    @classmethod
    def _get_azure_container(cls) -> str:
        raise NotImplementedError("Subclass must implement _get_azure_container()")

    @classmethod
    def _get_azure_connection_string(cls) -> str:
        raise NotImplementedError(
            "Subclass must implement _get_azure_connection_string()"
        )

    @classmethod
    def _get_upload_size_limit(cls) -> int:
        raise NotImplementedError("Subclass must implement _get_upload_size_limit()")

    @classmethod
    def get_s3_client(cls):
        if cls._s3_client is None:
            import boto3

            creds = cls._get_s3_credentials()
            cls._s3_client = boto3.client(
                "s3",
                aws_access_key_id=creds["aws_access_key_id"],
                aws_secret_access_key=creds["aws_secret_access_key"],
                region_name=creds["region_name"],
            )
        return cls._s3_client

    @classmethod
    def get_azure_blob_client(cls):
        if cls._azure_blob_client is None:
            from azure.storage.blob import BlobServiceClient

            cls._azure_blob_client = BlobServiceClient.from_connection_string(
                cls._get_azure_connection_string()
            )
        return cls._azure_blob_client

    @classmethod
    def get_by_name(cls, db: Session, name: str):
        return db.query(cls).filter(cls.name == name).first()

    @classmethod
    def install_csv_data(
        cls,
        file_name: str,
        db: Session,
        demo_data: bool = False,
        organization_id: int = 1,
        base_dir: str = None,
        force_update: bool = False,
        auto_commit: bool = True,
    ):
        from deepsel.utils.models_pool import models_pool

        data = cls._prepare_csv_data_install(file_name, organization_id, demo_data)

        super_user = (
            db.query(models_pool["user"]).filter_by(string_id="super_user").first()
        )
        if not super_user:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Required super_user account not found for attachment import",
            )

        for row in data:
            # For attachments, extract file_path from file:file_path before processing
            if "file:file_path" in row:
                row["file_path"] = row.pop("file:file_path")

            for key in list(row.keys()):
                if "/" in key and key.count("/") == 1:
                    cls._install_related_column(key, row, db, organization_id)
                elif ":" in key and key.count(":") == 1:
                    source_type, _ = key.split(":")
                    if source_type == "file":
                        cls._install_file_column(key, row)
                    elif source_type == "json":
                        cls._install_json_column(key, row, db, organization_id)
                    elif source_type == "attachment":
                        cls._install_attachment_column(key, row, db)

            file_path = row.pop("file_path", None)
            filename_override = row.pop("filename", None)

            if not demo_data:
                string_id = row.get("string_id")
                existing = None
                if string_id:
                    query = db.query(cls).filter_by(string_id=string_id)
                    if hasattr(cls, "organization_id"):
                        query = query.filter_by(organization_id=organization_id)
                    existing = query.first()

                if existing:
                    if not force_update:
                        logger.debug(
                            "Attachment with string_id %s already exists, skipping import",
                            string_id,
                        )
                        continue
                    for key, value in row.items():
                        if key not in ["file_path", "filename"]:
                            setattr(existing, key, value)
                    if not file_path or file_path == "null":
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Attachment import rows must include file_path",
                        )
                    resolved_file_path = file_path
                    if not os.path.isabs(resolved_file_path):
                        search_dir = base_dir or os.path.dirname(file_name)
                        candidate = os.path.join(search_dir, file_path)
                        if os.path.exists(candidate):
                            resolved_file_path = candidate
                    if not os.path.exists(resolved_file_path):
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Attachment source file not found: {file_path}",
                        )
                    with open(resolved_file_path, "rb") as file:
                        file_bytes = file.read()
                    upload_filename = filename_override or os.path.basename(file_path)
                    upload_file = UploadFile(
                        file=BytesIO(file_bytes),
                        filename=upload_filename,
                        size=len(file_bytes),
                    )

                    temp_attachment = cls()
                    temp_attachment.name = upload_filename
                    temp_attachment.content_type = cls._guess_content_type(
                        os.path.splitext(upload_filename)[1]
                    )
                    temp_attachment.filesize = len(file_bytes)

                    existing.name = temp_attachment.name
                    existing.content_type = temp_attachment.content_type
                    existing.filesize = temp_attachment.filesize
                    existing.alt_text = row.get("alt_text", existing.alt_text)

                    if auto_commit:
                        db.commit()
                    logger.debug(f"Updated attachment {string_id}")
                    continue

            if not file_path or file_path == "null":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Attachment import rows must include file_path",
                )

            resolved_file_path = file_path
            if not os.path.isabs(resolved_file_path):
                search_dir = base_dir or os.path.dirname(file_name)
                candidate = os.path.join(search_dir, file_path)
                if os.path.exists(candidate):
                    resolved_file_path = candidate
            if not os.path.exists(resolved_file_path):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Attachment source file not found: {file_path}",
                )

            with open(resolved_file_path, "rb") as file:
                file_bytes = file.read()

            upload_filename = filename_override or os.path.basename(file_path)
            upload_file = UploadFile(
                file=BytesIO(file_bytes),
                filename=upload_filename,
                size=len(file_bytes),
            )

            attachment = cls()
            attachment.create(
                db=db,
                user=super_user,
                file=upload_file,
                **row,
            )

    def create(self, db: Session, user, file, *args, **kwargs):
        [allowed, scope] = self._check_has_permission(PermissionAction.create, user)
        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to create this resource type",
            )

        if hasattr(self, "owner_id"):
            if "owner_id" not in kwargs:
                kwargs["owner_id"] = user.id

        if hasattr(self, "organization_id"):
            user_roles = user.get_user_roles()
            is_super = any(
                [role.string_id == "super_admin_role" for role in user_roles]
            )
            if not is_super or not kwargs.get("organization_id"):
                kwargs["organization_id"] = user.organization_id

        try:
            upload_size_limit = self.__class__._get_upload_size_limit()
            file_size = file.size / 1024 / 1024
            if file_size > upload_size_limit:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=f"File size limit of {upload_size_limit}MB exceeded",
                )
            kwargs.update({"filesize": file.size})
            sanitized_filename = sanitize_filename(file.filename)
            new_filename = sanitized_filename
            if not new_filename:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid filename",
                )

            if self.__class__.get_by_name(db, new_filename):
                while True:
                    candidate = randomize_file_name(sanitized_filename)
                    if not self.__class__.get_by_name(db, candidate):
                        new_filename = candidate
                        break

            file.filename = new_filename
            file_extension = os.path.splitext(file.filename)[1].lower()
            content_type = self._guess_content_type(file_extension)
            kwargs.update({"content_type": content_type})

            filesystem = self.__class__._get_storage_type()

            if filesystem == "s3":
                s3_client = self.__class__.get_s3_client()
                s3_bucket = self.__class__._get_s3_bucket()
                s3_key = f"{new_filename}"
                s3_client.upload_fileobj(
                    file.file,
                    s3_bucket,
                    new_filename,
                    ExtraArgs={
                        "Metadata": {
                            "owner_id": str(user.id),
                            "model": self.__class__.__name__,
                            "field": "name",
                            "record_id": str(id),
                            "original_filename": file.filename,
                        }
                    },
                )
                kwargs["type"] = AttachmentTypeOptions.s3
                kwargs["name"] = s3_key

            elif filesystem == "azure":
                from azure.storage.blob import ContentSettings

                blob_client_svc = self.__class__.get_azure_blob_client()
                azure_container = self.__class__._get_azure_container()
                container_client = blob_client_svc.get_container_client(azure_container)
                blob_client = container_client.get_blob_client(new_filename)
                blob_client.upload_blob(
                    file.file,
                    content_settings=ContentSettings(content_type=content_type),
                )
                kwargs["type"] = AttachmentTypeOptions.azure
                kwargs["name"] = new_filename

            else:
                os.makedirs(self.local_directory, exist_ok=True)
                local_path = os.path.join(self.local_directory, new_filename)
                with open(local_path, "wb") as f:
                    f.write(file.file.read())
                kwargs["type"] = AttachmentTypeOptions.local
                kwargs["name"] = new_filename

            for k, v in kwargs.items():
                setattr(self, k, v)
            db.add(self)
            db.commit()
            db.refresh(self)
            return self
        except IntegrityError as e:
            db.rollback()
            message = str(e.orig)
            detail = message.split("DETAIL:  ")[1]
            logger.error(
                f"Error creating record: {detail}\nFull traceback: {traceback.format_exc()}"
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Error creating record: {detail}",
            )

    def delete(
        self,
        db: Session,
        user,
        force: Optional[bool] = False,
        *args,
        **kwargs,
    ) -> [DeleteResponse]:  # type: ignore
        response = super().delete(db=db, user=user, force=force, *args, **kwargs)
        if self.type == AttachmentTypeOptions.s3:
            try:
                s3_client = self.__class__.get_s3_client()
                s3_bucket = self.__class__._get_s3_bucket()
                s3_client.delete_object(Bucket=s3_bucket, Key=self.name)
            except Exception:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to delete file from S3",
                )
        elif self.type == AttachmentTypeOptions.azure:
            try:
                blob_client_svc = self.__class__.get_azure_blob_client()
                azure_container = self.__class__._get_azure_container()
                container_client = blob_client_svc.get_container_client(azure_container)
                blob_client = container_client.get_blob_client(self.name)
                blob_client.delete_blob()
            except Exception:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to delete file from Azure Blob Storage",
                )
        elif self.type == AttachmentTypeOptions.local:
            try:
                local_path = os.path.join(self.local_directory, self.name)
                os.remove(local_path)
            except FileNotFoundError:
                logger.error(
                    f"Object Attachment with string_id {self.string_id} deleted with error: FileNotFoundError"
                )
            except Exception:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to delete file from local storage",
                )
        return response

    def get_data(self):
        if self.type == AttachmentTypeOptions.s3:
            try:
                s3_client = self.__class__.get_s3_client()
                s3_bucket = self.__class__._get_s3_bucket()
                response = s3_client.get_object(Bucket=s3_bucket, Key=self.name)
                return response["Body"].read()
            except Exception as e:
                logger.error(f"Failed to get file from S3: {str(e)}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to retrieve file from S3",
                )
        elif self.type == AttachmentTypeOptions.azure:
            try:
                blob_client_svc = self.__class__.get_azure_blob_client()
                azure_container = self.__class__._get_azure_container()
                container_client = blob_client_svc.get_container_client(azure_container)
                blob_client = container_client.get_blob_client(self.name)
                return blob_client.download_blob().readall()
            except Exception as e:
                logger.error(f"Failed to get file from Azure Blob Storage: {str(e)}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to retrieve file from Azure Blob Storage",
                )
        elif self.type == AttachmentTypeOptions.local:
            try:
                local_path = os.path.join(self.local_directory, self.name)
                with open(local_path, "rb") as f:
                    return f.read()
            except FileNotFoundError:
                logger.error(f"File not found: {local_path}")
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="File not found in local storage",
                )
            except Exception as e:
                logger.error(f"Failed to get file from local storage: {str(e)}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to retrieve file from local storage",
                )
        elif self.type == AttachmentTypeOptions.external:
            return self.name
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid attachment type",
            )

    @staticmethod
    def _guess_content_type(extension: str) -> str:
        content_types = {
            ".aac": "audio/aac",
            ".ai": "application/illustrator",
            ".avi": "video/x-msvideo",
            ".bmp": "image/bmp",
            ".bz2": "application/x-bzip2",
            ".css": "text/css",
            ".doc": "application/msword",
            ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ".eps": "application/postscript",
            ".flac": "audio/flac",
            ".flv": "video/x-flv",
            ".gif": "image/gif",
            ".gz": "application/gzip",
            ".html": "text/html",
            ".ico": "image/vnd.microsoft.icon",
            ".ics": "text/calendar",
            ".indd": "application/x-indesign",
            ".jpeg": "image/jpeg",
            ".jpg": "image/jpeg",
            ".js": "application/javascript",
            ".json": "application/json",
            ".mkv": "video/x-matroska",
            ".mov": "video/quicktime",
            ".mp3": "audio/mpeg",
            ".mp4": "video/mp4",
            ".mpeg": "video/mpeg",
            ".mpg": "video/mpeg",
            ".mpga": "audio/mpeg",
            ".odp": "application/vnd.oasis.opendocument.presentation",
            ".ods": "application/vnd.oasis.opendocument.spreadsheet",
            ".odt": "application/vnd.oasis.opendocument.text",
            ".ogg": "audio/ogg",
            ".opus": "audio/opus",
            ".pdf": "application/pdf",
            ".png": "image/png",
            ".ppt": "application/vnd.ms-powerpoint",
            ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            ".psd": "image/vnd.adobe.photoshop",
            ".rar": "application/vnd.rar",
            ".rtf": "application/rtf",
            ".svg": "image/svg+xml",
            ".tar": "application/x-tar",
            ".tif": "image/tiff",
            ".tiff": "image/tiff",
            ".txt": "text/plain",
            ".wav": "audio/wav",
            ".webm": "video/webm",
            ".webp": "image/webp",
            ".wmv": "video/x-ms-wmv",
            ".xaml": "application/xaml+xml",
            ".xls": "application/vnd.ms-excel",
            ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ".xml": "application/xml",
            ".xps": "application/vnd.ms-xpsdocument",
            ".zip": "application/zip",
        }
        return content_types.get(extension, "application/octet-stream")
