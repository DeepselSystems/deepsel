from unittest.mock import MagicMock, patch

import httpx
import pytest

from deepsel.utils.stock_image import (
    StockImageProviderEnum,
    _get_unsplash_client_id,
    _map_unsplash_item,
    search_unsplash_provider,
    track_unsplash_download,
)


def _mock_client(response=None, get_side_effect=None):
    """Patch target mimicking `with httpx.Client(...) as client`."""
    client = MagicMock()
    if get_side_effect is not None:
        client.get = MagicMock(side_effect=get_side_effect)
    else:
        client.get = MagicMock(return_value=response)
    cm = MagicMock()
    cm.__enter__ = MagicMock(return_value=client)
    cm.__exit__ = MagicMock(return_value=False)
    return cm, client


def _ok_response(payload, status=200, headers=None):
    resp = MagicMock(spec=httpx.Response)
    resp.status_code = status
    resp.json = MagicMock(return_value=payload)
    resp.text = ""
    resp.headers = headers or {}
    return resp


UNSPLASH_ITEM = {
    "id": "abc123",
    "description": "A sunset",
    "alt_description": "orange sky",
    "width": 4000,
    "height": 2000,
    "urls": {"small": "https://img/small", "regular": "https://img/regular"},
    "links": {"download_location": "https://api.unsplash.com/photos/abc123/download"},
    "user": {"name": "Jane", "links": {"html": "https://unsplash.com/@jane"}},
}


class TestClientId:
    def test_env_override(self, monkeypatch):
        monkeypatch.setenv("UNSPLASH_ACCESS_KEY", "my-key")
        assert _get_unsplash_client_id() == "my-key"

    def test_falls_back_to_default(self, monkeypatch):
        monkeypatch.delenv("UNSPLASH_ACCESS_KEY", raising=False)
        assert _get_unsplash_client_id()  # non-empty default


class TestMapItem:
    def test_maps_fields_and_aspect_ratio(self):
        item = _map_unsplash_item(UNSPLASH_ITEM)
        assert item.provider_image_id == "abc123"
        assert item.provider is StockImageProviderEnum.Unsplash
        assert item.aspect_ratio == 2.0
        assert item.preview_src == "https://img/small"
        assert item.src == "https://img/regular"
        assert item.photographer_name == "Jane"
        assert item.download_location.endswith("/download")

    def test_missing_dimensions_no_aspect_ratio(self):
        item = _map_unsplash_item({"id": "x", "urls": {}})
        assert item.aspect_ratio is None
        assert item.preview_src == ""


class TestSearch:
    def test_search_with_query_parses_results_key(self):
        resp = _ok_response({"results": [UNSPLASH_ITEM]})
        cm, client = _mock_client(resp)
        with patch("deepsel.utils.stock_image.httpx.Client", return_value=cm):
            result = search_unsplash_provider("sunset")
        assert result.success is True
        assert result.query_str == "sunset"
        assert len(result.data) == 1
        # query path hits the /search/photos endpoint
        assert "/search/photos" in client.get.call_args[0][0]

    def test_empty_query_uses_photos_endpoint_list_payload(self):
        resp = _ok_response([UNSPLASH_ITEM])
        cm, client = _mock_client(resp)
        with patch("deepsel.utils.stock_image.httpx.Client", return_value=cm):
            result = search_unsplash_provider("")
        assert result.success is True
        assert len(result.data) == 1
        assert "/photos?" in client.get.call_args[0][0]

    def test_401_returns_failure_message(self):
        resp = _ok_response({}, status=401)
        resp.text = "unauthorized"
        cm, _ = _mock_client(resp)
        with patch("deepsel.utils.stock_image.httpx.Client", return_value=cm):
            result = search_unsplash_provider("cats")
        assert result.success is False
        assert "UNSPLASH_ACCESS_KEY" in result.message
        assert result.data == []

    def test_rate_limit_403_message(self):
        resp = _ok_response({}, status=403, headers={"X-Ratelimit-Remaining": "0"})
        cm, _ = _mock_client(resp)
        with patch("deepsel.utils.stock_image.httpx.Client", return_value=cm):
            result = search_unsplash_provider("cats")
        assert result.success is False
        assert "rate limit" in result.message.lower()

    def test_request_error_handled(self):
        cm, _ = _mock_client(get_side_effect=httpx.RequestError("network down"))
        with patch("deepsel.utils.stock_image.httpx.Client", return_value=cm):
            result = search_unsplash_provider("cats")
        assert result.success is False
        assert "Request error" in result.message

    def test_non_list_payload_yields_empty_data(self):
        resp = _ok_response({"results": {"unexpected": "shape"}})
        cm, _ = _mock_client(resp)
        with patch("deepsel.utils.stock_image.httpx.Client", return_value=cm):
            result = search_unsplash_provider("cats")
        assert result.success is True
        assert result.data == []


class TestTrackDownload:
    def test_rejects_invalid_location(self):
        assert track_unsplash_download("") is False
        assert track_unsplash_download("https://evil.com/x") is False

    def test_success(self):
        resp = _ok_response({}, status=200)
        cm, _ = _mock_client(resp)
        with patch("deepsel.utils.stock_image.httpx.Client", return_value=cm):
            ok = track_unsplash_download("https://api.unsplash.com/photos/abc/download")
        assert ok is True

    def test_http_error_returns_false(self):
        resp = _ok_response({}, status=500)
        cm, _ = _mock_client(resp)
        with patch("deepsel.utils.stock_image.httpx.Client", return_value=cm):
            ok = track_unsplash_download("https://api.unsplash.com/photos/abc/download")
        assert ok is False
