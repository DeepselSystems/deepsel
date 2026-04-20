"""OpenRouter OAuth integration — exchange auth code for API key."""

import logging

import httpx

logger = logging.getLogger(__name__)

OPENROUTER_AUTH_URL = "https://openrouter.ai/auth"
OPENROUTER_KEYS_URL = "https://openrouter.ai/api/v1/auth/keys"


class OpenRouterOAuthService:
    """Handles OpenRouter OAuth code exchange."""

    def __init__(self, callback_url: str | None = None):
        self.callback_url = callback_url

    def get_auth_url(self, callback_url: str | None = None) -> str:
        """Build the OpenRouter authorization URL."""
        url = callback_url or self.callback_url
        if not url:
            raise ValueError("callback_url is required")
        return f"{OPENROUTER_AUTH_URL}?callback_url={url}"

    async def exchange_code(self, code: str, code_verifier: str | None = None) -> str:
        """Exchange an authorization code for an API key (PKCE flow).

        Args:
            code: The auth code received from OpenRouter callback.
            code_verifier: PKCE code verifier (required if code_challenge was used).

        Returns:
            The API key string.

        Raises:
            httpx.HTTPStatusError: If the exchange request fails.
        """
        body: dict = {"code": code}
        if code_verifier:
            body["code_verifier"] = code_verifier
            body["code_challenge_method"] = "S256"

        async with httpx.AsyncClient() as client:
            response = await client.post(
                OPENROUTER_KEYS_URL,
                json=body,
            )
            response.raise_for_status()
            data = response.json()
            key = data.get("key")
            if not key:
                raise ValueError(f"OpenRouter returned no key: {data}")
            return key
