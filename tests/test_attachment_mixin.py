"""Tests for deepsel.orm.attachment_mixin.AttachmentMixin.

Focuses on the self-contained, security/data-integrity-relevant units:
storage-quota enforcement, backend-specific serve/data retrieval, filename
collision resolution, server-side copy, and the lazy storage-client cache.
All external services (S3, Azure, local filesystem) are mocked — no network
and no real credentials.
"""

import os
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException
from sqlalchemy import Column, Enum, Integer, String, create_engine
from sqlalchemy.orm import Session, declarative_base

# Import models_pool first to avoid the package-level circular import that
# triggers when deepsel.orm.mixin is the first deepsel module loaded.
from deepsel.utils.models_pool import models_pool
from deepsel.orm.mixin import ORMBaseMixin
from deepsel.orm.attachment_mixin import AttachmentMixin, AttachmentTypeOptions

# ---------------------------------------------------------------------------
# Test model
# ---------------------------------------------------------------------------

Base = declarative_base()

UPLOAD_LIMIT_MB = 10
MAX_STORAGE_MB = 5
S3_BUCKET = "test-bucket"
AZURE_CONTAINER = "test-container"


class AttachModel(Base, AttachmentMixin, ORMBaseMixin):
    __tablename__ = "attachment"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255))
    content_type = Column(String(100), nullable=True)
    filesize = Column(Integer, nullable=True)
    type = Column(Enum(AttachmentTypeOptions), nullable=True)
    organization_id = Column(Integer, nullable=True)
    owner_id = Column(Integer, nullable=True)

    @classmethod
    def _get_storage_type(cls) -> str:
        return "s3"

    @classmethod
    def _get_s3_bucket(cls) -> str:
        return S3_BUCKET

    @classmethod
    def _get_s3_credentials(cls) -> dict:
        return {
            "aws_access_key_id": "key",
            "aws_secret_access_key": "secret",
            "region_name": "us-east-1",
        }

    @classmethod
    def _get_azure_container(cls) -> str:
        return AZURE_CONTAINER

    @classmethod
    def _get_azure_connection_string(cls) -> str:
        return "DefaultEndpointsProtocol=https;AccountName=acct;AccountKey=k;"

    @classmethod
    def _get_upload_size_limit(cls) -> int:
        return UPLOAD_LIMIT_MB

    @classmethod
    def _get_max_storage_limit(cls):
        return MAX_STORAGE_MB


# A model with no hooks overridden, to assert the NotImplementedError contract.
class BareAttachModel(AttachmentMixin):
    pass


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def engine(pg_container):
    url = pg_container.get_connection_url()
    eng = create_engine(url)
    Base.metadata.create_all(eng)
    yield eng
    Base.metadata.drop_all(eng)
    eng.dispose()


@pytest.fixture
def db(engine):
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection)

    old_pool = dict(models_pool)
    models_pool["attachment"] = AttachModel

    yield session

    session.close()
    transaction.rollback()
    connection.close()
    models_pool.clear()
    models_pool.update(old_pool)


@pytest.fixture(autouse=True)
def reset_client_cache():
    """Storage-client caches are class attributes; reset around each test so
    one test's mock client never leaks into another."""
    AttachModel._s3_client = None
    AttachModel._azure_blob_client = None
    yield
    AttachModel._s3_client = None
    AttachModel._azure_blob_client = None


MB = 1024 * 1024


def _make_attachment(db, **kwargs):
    att = AttachModel(**kwargs)
    db.add(att)
    db.flush()
    return att


# ===========================================================================
# check_storage_quota
# ===========================================================================


class TestCheckStorageQuota:
    def test_under_limit_passes(self, db):
        _make_attachment(db, name="a.bin", filesize=1 * MB)
        info = AttachModel.check_storage_quota(db, additional_bytes=1 * MB)
        assert info["max_mb"] == MAX_STORAGE_MB
        assert info["used_mb"] == pytest.approx(1.0)

    def test_exceeding_limit_raises_400(self, db):
        _make_attachment(db, name="big.bin", filesize=4 * MB)
        with pytest.raises(HTTPException) as exc:
            # 4 MB used + 2 MB more = 6 MB > 5 MB limit
            AttachModel.check_storage_quota(db, additional_bytes=2 * MB)
        assert exc.value.status_code == 400

    def test_zero_additional_bytes_skips_check(self, db):
        # Already over limit, but additional_bytes == 0 → no enforcement.
        _make_attachment(db, name="huge.bin", filesize=100 * MB)
        info = AttachModel.check_storage_quota(db, additional_bytes=0)
        assert info["used_mb"] == pytest.approx(100.0)

    def test_no_limit_configured_never_raises(self, db, monkeypatch):
        monkeypatch.setattr(
            AttachModel, "_get_max_storage_limit", classmethod(lambda cls: None)
        )
        _make_attachment(db, name="x.bin", filesize=100 * MB)
        info = AttachModel.check_storage_quota(db, additional_bytes=100 * MB)
        assert info["max_mb"] is None

    def test_empty_table_reports_zero_usage(self, db):
        info = AttachModel.check_storage_quota(db, additional_bytes=0)
        assert info["used_mb"] == 0


# ===========================================================================
# get_serve_result
# ===========================================================================


class TestGetServeResult:
    def test_s3_returns_presigned_url(self, monkeypatch):
        fake_s3 = MagicMock()
        fake_s3.generate_presigned_url.return_value = "https://s3/presigned"
        monkeypatch.setattr(
            AttachModel, "get_s3_client", classmethod(lambda cls: fake_s3)
        )

        att = AttachModel(
            name="file.png", content_type="image/png", type=AttachmentTypeOptions.s3
        )
        result = att.get_serve_result()

        assert result.redirect_url == "https://s3/presigned"
        assert result.content_type == "image/png"
        _, kwargs = fake_s3.generate_presigned_url.call_args
        assert kwargs["Params"] == {"Bucket": S3_BUCKET, "Key": "file.png"}

    def test_azure_returns_sas_url(self, monkeypatch):
        fake_client = MagicMock()
        fake_client.credential.account_key = "account-key"
        fake_client.account_name = "myaccount"
        monkeypatch.setattr(
            AttachModel, "get_azure_blob_client", classmethod(lambda cls: fake_client)
        )
        import azure.storage.blob as azblob

        monkeypatch.setattr(azblob, "generate_blob_sas", lambda **kw: "sas=token")

        att = AttachModel(
            name="doc file.pdf",
            content_type="application/pdf",
            type=AttachmentTypeOptions.azure,
        )
        result = att.get_serve_result()

        assert result.redirect_url.startswith(
            "https://myaccount.blob.core.windows.net/test-container/"
        )
        # Filename is URL-quoted in the blob path.
        assert "doc%20file.pdf" in result.redirect_url
        assert result.redirect_url.endswith("?sas=token")

    def test_local_returns_content(self, monkeypatch):
        monkeypatch.setattr(AttachModel, "get_data", lambda self: b"local-bytes")
        att = AttachModel(
            name="note.txt",
            content_type="text/plain",
            type=AttachmentTypeOptions.local,
        )
        result = att.get_serve_result()
        assert result.content == b"local-bytes"
        assert result.redirect_url is None

    def test_external_type_raises_400(self):
        att = AttachModel(name="x", type=AttachmentTypeOptions.external)
        with pytest.raises(HTTPException) as exc:
            att.get_serve_result()
        assert exc.value.status_code == 400


# ===========================================================================
# get_data
# ===========================================================================


class TestGetData:
    def test_external_returns_name(self):
        att = AttachModel(name="https://cdn/file", type=AttachmentTypeOptions.external)
        assert att.get_data() == "https://cdn/file"

    def test_local_reads_file(self, monkeypatch, tmp_path):
        (tmp_path / "hello.txt").write_bytes(b"hi there")
        monkeypatch.setattr(AttachModel, "local_directory", str(tmp_path))
        att = AttachModel(name="hello.txt", type=AttachmentTypeOptions.local)
        assert att.get_data() == b"hi there"

    def test_local_missing_file_raises_404(self, monkeypatch, tmp_path):
        monkeypatch.setattr(AttachModel, "local_directory", str(tmp_path))
        att = AttachModel(name="missing.txt", type=AttachmentTypeOptions.local)
        with pytest.raises(HTTPException) as exc:
            att.get_data()
        assert exc.value.status_code == 404

    def test_s3_failure_raises_500(self, monkeypatch):
        fake_s3 = MagicMock()
        fake_s3.get_object.side_effect = RuntimeError("boom")
        monkeypatch.setattr(
            AttachModel, "get_s3_client", classmethod(lambda cls: fake_s3)
        )
        att = AttachModel(name="f.bin", type=AttachmentTypeOptions.s3)
        with pytest.raises(HTTPException) as exc:
            att.get_data()
        assert exc.value.status_code == 500


# ===========================================================================
# Lazy storage-client caches
# ===========================================================================


class TestStorageClientCache:
    def test_s3_client_built_once_and_cached(self, monkeypatch):
        import boto3

        fake = MagicMock()
        calls = MagicMock(return_value=fake)
        monkeypatch.setattr(boto3, "client", calls)

        first = AttachModel.get_s3_client()
        second = AttachModel.get_s3_client()

        assert first is fake and second is fake
        calls.assert_called_once()  # cached after first build

    def test_azure_client_built_once_and_cached(self, monkeypatch):
        import azure.storage.blob as azblob

        fake = MagicMock()
        factory = MagicMock(return_value=fake)
        monkeypatch.setattr(azblob.BlobServiceClient, "from_connection_string", factory)

        first = AttachModel.get_azure_blob_client()
        second = AttachModel.get_azure_blob_client()

        assert first is fake and second is fake
        factory.assert_called_once()


# ===========================================================================
# get_by_name / filename resolution
# ===========================================================================


class TestGetByName:
    def test_found_and_missing(self, db):
        _make_attachment(db, name="report.pdf")
        assert AttachModel.get_by_name(db, "report.pdf") is not None
        assert AttachModel.get_by_name(db, "nope.pdf") is None


class TestResolveUniqueFilename:
    def test_sanitizes_special_chars(self, db):
        # sanitize_filename strips ~!@#$%^&*()
        resolved = AttachModel._resolve_unique_filename("in@va#li!d.txt", db=db)
        assert resolved == "invalid.txt"

    def test_empty_after_sanitize_raises_400(self, db):
        with pytest.raises(HTTPException) as exc:
            AttachModel._resolve_unique_filename("!@#$", db=db)
        assert exc.value.status_code == 400

    def test_collision_gets_randomized(self, db):
        _make_attachment(db, name="dup.txt")
        resolved = AttachModel._resolve_unique_filename("dup.txt", db=db)
        assert resolved != "dup.txt"
        assert resolved.startswith("dup-") and resolved.endswith(".txt")

    def test_collision_with_excluded_id_keeps_name(self, db):
        att = _make_attachment(db, name="self.txt")
        # Excluding the conflicting record itself → no rename (rename-in-place case).
        resolved = AttachModel._resolve_unique_filename(
            "self.txt", db=db, exclude_id=att.id
        )
        assert resolved == "self.txt"


class TestResolveTargetName:
    def test_auto_unique_delegates_to_resolver(self, db):
        _make_attachment(db, name="taken.txt")
        resolved = AttachModel._resolve_target_name(
            "taken.txt", db=db, auto_unique=True
        )
        assert resolved != "taken.txt"

    def test_conflict_without_auto_unique_raises_409(self, db):
        _make_attachment(db, name="taken.txt")
        with pytest.raises(HTTPException) as exc:
            AttachModel._resolve_target_name("taken.txt", db=db, auto_unique=False)
        assert exc.value.status_code == 409

    def test_no_conflict_returns_sanitized(self, db):
        resolved = AttachModel._resolve_target_name(
            "fr#esh.txt", db=db, auto_unique=False
        )
        assert resolved == "fresh.txt"

    def test_empty_name_raises_400(self, db):
        with pytest.raises(HTTPException) as exc:
            AttachModel._resolve_target_name("!@#", db=db, auto_unique=False)
        assert exc.value.status_code == 400


# ===========================================================================
# _copy_file_in_storage
# ===========================================================================


class TestCopyFileInStorage:
    def test_s3_server_side_copy(self, monkeypatch):
        fake_s3 = MagicMock()
        monkeypatch.setattr(
            AttachModel, "get_s3_client", classmethod(lambda cls: fake_s3)
        )

        AttachModel._copy_file_in_storage("src.bin", "dst.bin")

        _, kwargs = fake_s3.copy_object.call_args
        assert kwargs["Bucket"] == S3_BUCKET
        assert kwargs["CopySource"] == {"Bucket": S3_BUCKET, "Key": "src.bin"}
        assert kwargs["Key"] == "dst.bin"

    def test_s3_failure_raises_500(self, monkeypatch):
        fake_s3 = MagicMock()
        fake_s3.copy_object.side_effect = RuntimeError("no")
        monkeypatch.setattr(
            AttachModel, "get_s3_client", classmethod(lambda cls: fake_s3)
        )
        with pytest.raises(HTTPException) as exc:
            AttachModel._copy_file_in_storage("a", "b")
        assert exc.value.status_code == 500

    def test_local_copy(self, monkeypatch, tmp_path):
        monkeypatch.setattr(
            AttachModel, "_get_storage_type", classmethod(lambda cls: "local")
        )
        monkeypatch.setattr(AttachModel, "local_directory", str(tmp_path))
        (tmp_path / "src.txt").write_bytes(b"payload")

        AttachModel._copy_file_in_storage("src.txt", "dst.txt")

        assert (tmp_path / "dst.txt").read_bytes() == b"payload"
        assert (tmp_path / "src.txt").exists()  # source preserved

    def test_local_missing_source_raises_404(self, monkeypatch, tmp_path):
        monkeypatch.setattr(
            AttachModel, "_get_storage_type", classmethod(lambda cls: "local")
        )
        monkeypatch.setattr(AttachModel, "local_directory", str(tmp_path))
        with pytest.raises(HTTPException) as exc:
            AttachModel._copy_file_in_storage("ghost.txt", "dst.txt")
        assert exc.value.status_code == 404


# ===========================================================================
# _guess_content_type
# ===========================================================================


class TestGuessContentType:
    def test_known_extension(self):
        assert AttachModel._guess_content_type(".png") == "image/png"

    def test_unknown_extension_falls_back(self):
        assert (
            AttachModel._guess_content_type(".unknownext") == "application/octet-stream"
        )


# ===========================================================================
# Abstract hook contract
# ===========================================================================


class TestAbstractHooks:
    @pytest.mark.parametrize(
        "method",
        [
            "_get_storage_type",
            "_get_s3_bucket",
            "_get_s3_credentials",
            "_get_azure_container",
            "_get_azure_connection_string",
            "_get_upload_size_limit",
        ],
    )
    def test_unimplemented_hook_raises(self, method):
        with pytest.raises(NotImplementedError):
            getattr(BareAttachModel, method)()

    def test_default_hooks_have_sensible_values(self):
        assert BareAttachModel._get_s3_presign_expiration() == 3600
        assert BareAttachModel._get_max_storage_limit() is None
        assert BareAttachModel._get_azure_sas_expiry_minutes() == 30
