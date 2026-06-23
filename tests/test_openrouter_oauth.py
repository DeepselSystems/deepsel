import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from deepsel.auth.openrouter_oauth import (
    OPENROUTER_AUTH_URL,
    OpenRouterOAuthService,
)


def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def _mock_async_client(response):
    """Build a patch target for httpx.AsyncClient used as async context manager."""
    client = MagicMock()
    client.post = AsyncMock(return_value=response)
    cm = MagicMock()
    cm.__aenter__ = AsyncMock(return_value=client)
    cm.__aexit__ = AsyncMock(return_value=False)
    return cm, client


class TestGetAuthUrl:
    def test_uses_instance_callback(self):
        svc = OpenRouterOAuthService(callback_url="https://app/cb")
        assert (
            svc.get_auth_url() == f"{OPENROUTER_AUTH_URL}?callback_url=https://app/cb"
        )

    def test_arg_overrides_instance(self):
        svc = OpenRouterOAuthService(callback_url="https://app/cb")
        url = svc.get_auth_url("https://other/cb")
        assert url == f"{OPENROUTER_AUTH_URL}?callback_url=https://other/cb"

    def test_missing_callback_raises(self):
        svc = OpenRouterOAuthService()
        with pytest.raises(ValueError):
            svc.get_auth_url()


class TestExchangeCode:
    def test_happy_path_returns_key(self):
        response = MagicMock()
        response.raise_for_status = MagicMock()
        response.json = MagicMock(return_value={"key": "sk-or-123"})
        cm, client = _mock_async_client(response)
        svc = OpenRouterOAuthService()
        with patch("httpx.AsyncClient", return_value=cm):
            key = _run(svc.exchange_code("auth-code"))
        assert key == "sk-or-123"
        client.post.assert_awaited_once()
        _, kwargs = client.post.call_args
        assert kwargs["json"] == {"code": "auth-code"}

    def test_pkce_body_fields(self):
        response = MagicMock()
        response.raise_for_status = MagicMock()
        response.json = MagicMock(return_value={"key": "sk-or-xyz"})
        cm, client = _mock_async_client(response)
        svc = OpenRouterOAuthService()
        with patch("httpx.AsyncClient", return_value=cm):
            _run(svc.exchange_code("code", code_verifier="verifier"))
        _, kwargs = client.post.call_args
        assert kwargs["json"] == {
            "code": "code",
            "code_verifier": "verifier",
            "code_challenge_method": "S256",
        }

    def test_missing_key_raises(self):
        response = MagicMock()
        response.raise_for_status = MagicMock()
        response.json = MagicMock(return_value={"error": "bad"})
        cm, _ = _mock_async_client(response)
        svc = OpenRouterOAuthService()
        with patch("httpx.AsyncClient", return_value=cm):
            with pytest.raises(ValueError):
                _run(svc.exchange_code("code"))

    def test_http_error_propagates(self):
        response = MagicMock()
        response.raise_for_status = MagicMock(side_effect=RuntimeError("boom"))
        cm, _ = _mock_async_client(response)
        svc = OpenRouterOAuthService()
        with patch("httpx.AsyncClient", return_value=cm):
            with pytest.raises(RuntimeError):
                _run(svc.exchange_code("code"))
