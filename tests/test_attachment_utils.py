from unittest.mock import MagicMock

import pytest

# attachment.py performs models_pool lookups at import time. Seed stubs BEFORE
# importing so the module loads without a fully-bootstrapped app.
from deepsel.utils import models_pool as _mp

_mp.models_pool.setdefault("attachment", MagicMock(name="AttachmentModel"))
_mp.models_pool.setdefault(
    "attachment_locale_version", MagicMock(name="AttachmentLocaleVersionModel")
)

from deepsel.utils.attachment import (  # noqa: E402
    _extract_attachment_names,
    resolve_unique_attachment_name,
)


class TestExtractAttachmentNames:
    def test_single_image_call(self):
        content = "before {{ attachment('hero') }} after"
        assert _extract_attachment_names(content) == {"hero"}

    def test_whitespace_trim_marker_variant(self):
        content = "{{- attachment('logo')  }}"
        assert _extract_attachment_names(content) == {"logo"}

    def test_multi_image_gallery(self):
        content = "{{ attachment('img1', 'img2', 'img3') }}"
        assert _extract_attachment_names(content) == {"img1", "img2", "img3"}

    def test_skips_trailing_json_config(self):
        content = "{{ attachment('img1', 'img2', '{\"cols\": 2}') }}"
        assert _extract_attachment_names(content) == {"img1", "img2"}

    def test_multiple_calls_accumulate(self):
        content = "{{ attachment('a') }} text {{ attachment('b', 'c') }}"
        assert _extract_attachment_names(content) == {"a", "b", "c"}

    def test_no_attachments_returns_empty_set(self):
        assert _extract_attachment_names("plain content, no calls") == set()

    def test_multiline_call(self):
        content = "{{ attachment(\n  'one',\n  'two'\n) }}"
        assert _extract_attachment_names(content) == {"one", "two"}


class TestResolveUniqueAttachmentName:
    def _db_with_first_results(self, results):
        db = MagicMock()
        db.query.return_value.filter.return_value.first.side_effect = results
        return db

    def test_no_conflict_returns_sanitized_base(self):
        db = self._db_with_first_results([None])
        assert resolve_unique_attachment_name("My@Report!.pdf", db) == "MyReport"

    def test_conflict_appends_suffix(self):
        # base taken, then "-1" taken, then "-2" free
        db = self._db_with_first_results([object(), object(), None])
        assert resolve_unique_attachment_name("photo.png", db) == "photo-2"

    def test_empty_name_falls_back_to_file(self):
        db = self._db_with_first_results([None])
        assert resolve_unique_attachment_name("~!@#$.txt", db) == "file"
