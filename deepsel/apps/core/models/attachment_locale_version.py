import os

from sqlalchemy import Column, Enum, Integer, String, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship

from db import Base
from deepsel.apps.core.mixins.base_model import ORMBaseMixin
from deepsel.orm.attachment_mixin import AttachmentMixin, AttachmentTypeOptions


class AttachmentLocaleVersionModel(Base, AttachmentMixin, ORMBaseMixin):
    """
    One file per locale per attachment object.
    EN and DE can have completely different files, file names, and alt text.
    The file_name (stored as 'name') is SEO-friendly and used as the storage key.
    """

    __tablename__ = "attachment_locale_version"

    id = Column(Integer, primary_key=True)
    # Storage key — SEO-friendly name used in the serve URL (/attachment/serve/{name}).
    # Recommended to use language-relevant keywords (e.g. "willkommen.jpg" for DE).
    name = Column(String, unique=True, nullable=False)
    type = Column(Enum(AttachmentTypeOptions))
    content_type = Column(String)
    filesize = Column(Integer, nullable=True)
    alt_text = Column(String, nullable=True)

    local_directory = os.path.join("files")

    attachment_id = Column(Integer, ForeignKey("attachment.id"), nullable=False)
    attachment = relationship("AttachmentModel", back_populates="locale_versions")

    locale_id = Column(Integer, ForeignKey("locale.id"), nullable=False)
    locale = relationship("LocaleModel")

    __table_args__ = (
        UniqueConstraint(
            "attachment_id",
            "locale_id",
            name="uq_attachment_locale_version_attachment_locale",
        ),
    )

    # --- AttachmentMixin settings (same storage backend as AttachmentModel) ---

    @classmethod
    def _get_storage_type(cls):
        from settings import FILESYSTEM

        return FILESYSTEM

    @classmethod
    def _get_s3_bucket(cls):
        from settings import S3_BUCKET

        return S3_BUCKET

    @classmethod
    def _get_s3_credentials(cls):
        from settings import AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION

        return {
            "aws_access_key_id": AWS_ACCESS_KEY_ID,
            "aws_secret_access_key": AWS_SECRET_ACCESS_KEY,
            "region_name": AWS_REGION,
        }

    @classmethod
    def _get_azure_container(cls):
        from settings import AZURE_STORAGE_CONTAINER

        return AZURE_STORAGE_CONTAINER

    @classmethod
    def _get_azure_connection_string(cls):
        from settings import AZURE_STORAGE_CONNECTION_STRING

        return AZURE_STORAGE_CONNECTION_STRING

    @classmethod
    def _get_upload_size_limit(cls):
        from settings import UPLOAD_SIZE_LIMIT

        return UPLOAD_SIZE_LIMIT

    @classmethod
    def _get_s3_presign_expiration(cls):
        from settings import S3_PRESIGN_EXPIRATION

        return int(S3_PRESIGN_EXPIRATION.total_seconds())

    @classmethod
    def _get_max_storage_limit(cls):
        from settings import MAX_STORAGE_LIMIT

        return MAX_STORAGE_LIMIT

    @classmethod
    def _pre_upload_check(cls, file):
        from settings import CLAMAV_HOST

        if CLAMAV_HOST:
            from clamd import ClamdNetworkSocket
            from fastapi import HTTPException, status

            clamav = ClamdNetworkSocket(CLAMAV_HOST, 3310)
            scan_result = clamav.instream(file.file)
            file.file.seek(0)
            if scan_result["stream"][0] != "OK":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="File infected!",
                )
