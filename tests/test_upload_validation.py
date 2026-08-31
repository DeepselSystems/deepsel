"""RB-17 — `POST /attachment` must validate MIME type and size.

The route used to accept any content type and never enforced
`UPLOAD_SIZE_LIMIT`; the only filter was the admin UI's client-side `accept`
attribute, and `GET /attachment/config/upload_size_limit` merely *reported* a
limit nothing checked.
"""

import io

import pytest
from fastapi import HTTPException, UploadFile

import deepsel.utils  # noqa: F401  (import first: known package import-order quirk)
from deepsel.apps.core.utils import upload_validation


def _upload(name: str, size: int = 16) -> UploadFile:
    return UploadFile(filename=name, file=io.BytesIO(b"x" * size))


class _FakeSettings:
    pass


class TestValidateUpload:
    def test_accepts_an_image(self):
        assert upload_validation.validate_upload(_upload("nameplate.png", 32)) == 32

    def test_rejects_a_text_file(self):
        with pytest.raises(HTTPException) as exc:
            upload_validation.validate_upload(_upload("evil.txt"))
        assert exc.value.status_code == 400
        assert ".txt" in exc.value.detail

    def test_rejects_a_script(self):
        for name in ("payload.js", "shell.sh", "page.html", "archive.zip"):
            with pytest.raises(HTTPException):
                upload_validation.validate_upload(_upload(name))

    def test_rejects_a_file_with_no_extension(self):
        with pytest.raises(HTTPException):
            upload_validation.validate_upload(_upload("noextension"))

    def test_rejects_an_oversized_file(self, monkeypatch):
        settings = _FakeSettings()
        settings.UPLOAD_SIZE_LIMIT = 1  # MB
        monkeypatch.setattr("deepsel.deps.settings", settings)

        with pytest.raises(HTTPException) as exc:
            upload_validation.validate_upload(_upload("big.png", 2 * 1024 * 1024))
        assert exc.value.status_code == 400
        assert "exceeds" in exc.value.detail

    def test_accepts_a_file_at_the_limit(self, monkeypatch):
        settings = _FakeSettings()
        settings.UPLOAD_SIZE_LIMIT = 1
        monkeypatch.setattr("deepsel.deps.settings", settings)

        size = 1024 * 1024
        assert upload_validation.validate_upload(_upload("ok.png", size)) == size

    def test_leaves_the_file_cursor_at_zero(self):
        upload = _upload("nameplate.png", 64)
        upload_validation.validate_upload(upload)
        assert upload.file.tell() == 0

    def test_settings_can_widen_the_allowlist(self, monkeypatch):
        settings = _FakeSettings()
        settings.ALLOWED_UPLOAD_EXTENSIONS = ["txt", ".csv"]
        monkeypatch.setattr("deepsel.deps.settings", settings)

        assert upload_validation.validate_upload(_upload("notes.txt")) == 16
        with pytest.raises(HTTPException):
            upload_validation.validate_upload(_upload("photo.png"))
