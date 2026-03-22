import logging
import re
from datetime import datetime, timedelta
from enum import Enum
from typing import Optional
from urllib.parse import urlencode

import httpx
from pydantic import BaseModel

logger = logging.getLogger(__name__)

# Constants
SECRET_KEY_CACHE_DURATION_MINUTES = 10
PEXELS_ENDPOINTS = {
    "source": "https://static.pexels.com/1/_next/static/chunks/pages/_app-5c3673f2de7bae26.js",
    "api_base": "https://www.pexels.com/en-us/api/v3",
}  # Currently ignoring the use of standard provider api keys, the current business allows accepting static source urls from Pexels


class StockImageProviderEnum(Enum):
    Pexels = "Pexels"
    Unsplash = "Unsplash"


class _PhotoItem(BaseModel):
    """
    Represents a single photo item from stock image provider.
    """

    provider_image_id: int
    provider: StockImageProviderEnum
    title: Optional[str]
    description: Optional[str]
    width: Optional[int]
    height: Optional[int]
    aspect_ratio: Optional[float]
    preview_src: str
    src: str


class _SearchResult(BaseModel):
    success: bool
    message: str
    query_str: str
    page: Optional[int] = None
    data: list[_PhotoItem]


class _ProviderSecretKeyCache:
    """
    Cache for storing provider secret keys with expiration time.
    Supports multiple providers (e.g., pexels, unsplash, etc.).
    """

    def __init__(self):
        self._pexels_secret_key: Optional[str] = None
        self._pexels_secret_key_expires_at: Optional[datetime] = None

    def get_pexels_secret_key(self) -> Optional[str]:
        """
        Get cached Pexels secret key if it exists and is not expired.
        Returns None if key doesn't exist or has expired.
        """
        if (
            self._pexels_secret_key is None
            or self._pexels_secret_key_expires_at is None
        ):
            return None

        if datetime.now() >= self._pexels_secret_key_expires_at:
            # Key has expired, clear it
            self._pexels_secret_key = None
            self._pexels_secret_key_expires_at = None
            return None

        return self._pexels_secret_key

    def set_pexels_secret_key(
        self, secret_key: str, duration_minutes: int = SECRET_KEY_CACHE_DURATION_MINUTES
    ) -> None:
        """
        Set Pexels secret key with expiration time.

        Args:
            secret_key: The secret key to cache
            duration_minutes: Cache duration in minutes (default from constant)
        """
        self._pexels_secret_key = secret_key
        self._pexels_secret_key_expires_at = datetime.now() + timedelta(
            minutes=duration_minutes
        )


# Global cache instance
_provider_cache = _ProviderSecretKeyCache()


def _fetch_pexels_secret_key() -> Optional[str]:
    """
    Fetch Pexels secret key from source URL.

    Returns:
        Extracted secret key or None if failed
    """
    source_url = PEXELS_ENDPOINTS["source"]
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Accept-Language": "en-US,en;q=0.9,vi;q=0.8",
    }

    try:
        with httpx.Client(follow_redirects=True) as client:
            source_response = client.get(source_url, headers=headers, timeout=10)
            source_response.raise_for_status()

            # Extract secret key from response text using regex
            # Note: Ignoring B105 as we need to extract the secret key from the response
            secret_key_pattern = r'secret-key":"([^"]+)"'  # nosec B105
            match = re.search(secret_key_pattern, source_response.text)

            if match:
                extracted_secret_key = match.group(1)
                logger.info("Pexels secret key fetched successfully")
                return extracted_secret_key
            else:
                logger.warning(
                    "Could not extract secret key from Pexels source response"
                )
                return None
    except Exception as e:
        logger.error(f"Failed to fetch Pexels secret key: {e}")
        return None


def _get_or_fetch_pexels_secret_key() -> Optional[str]:
    """
    Get Pexels secret key from cache or fetch new one if expired/missing.

    Returns:
        Secret key or None if failed to fetch
    """
    # Try to get from cache first
    cached_key = _provider_cache.get_pexels_secret_key()
    if cached_key:
        logger.info("Using cached Pexels secret key")
        return cached_key

    # Cache miss or expired, fetch new key
    logger.info("Fetching new Pexels secret key")
    new_key = _fetch_pexels_secret_key()
    if new_key:
        _provider_cache.set_pexels_secret_key(new_key)

    return new_key


def search_pexels_provider(
    query_str: str, page: int = 1, per_page: int = 24
) -> _SearchResult:
    """
    Search photos from Pexels provider.

    Args:
        query_str: Search query string
        page: Page number (default: 1)
        per_page: Results per page (default: 24)

    Returns:
        _SearchResult with success status and data
    """
    # Get or fetch secret key
    secret_key = _get_or_fetch_pexels_secret_key()
    if not secret_key:
        return _SearchResult(
            success=False,
            message="Failed to obtain Pexels secret key",
            query_str=query_str,
            data=[],
        )

    # URL search provider
    encoded_params = urlencode({"query": query_str, "page": page, "per_page": per_page})
    url = f"{PEXELS_ENDPOINTS['api_base']}/search/photos?{encoded_params}"

    # Header
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Accept-Language": "en-US,en;q=0.9,vi;q=0.8",
        "Connection": "keep-alive",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Ch-Ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"macOS"',
        "secret-key": secret_key,
    }

    try:
        with httpx.Client(follow_redirects=True) as client:
            response = client.get(url, headers=headers, timeout=10)
            response.raise_for_status()
            result = response.json()
            return _SearchResult(
                success=True,
                message="Success",
                query_str=query_str,
                page=page,
                data=[
                    _PhotoItem(
                        provider_image_id=item.get("id"),
                        provider=StockImageProviderEnum.Pexels,
                        title=item.get("attributes").get("title", ""),
                        description=item.get("attributes").get("description", ""),
                        width=item.get("attributes").get("width"),
                        height=item.get("attributes").get("height"),
                        aspect_ratio=item.get("attributes").get("aspect_ratio"),
                        preview_src=item.get("attributes").get("image").get("medium"),
                        src=item.get("attributes").get("image").get("download_link"),
                    )
                    for item in result.get("data", [])
                ],
            )
    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP error occurred: {e}")
        return _SearchResult(
            success=False,
            message=f"HTTP error occurred: {e}",
            query_str=query_str,
            data=[],
        )
    except httpx.RequestError as e:
        logger.error(f"Request error occurred: {e}")
        return _SearchResult(
            success=False,
            message=f"Request error occurred: {e}",
            query_str=query_str,
            data=[],
        )
    except Exception as e:
        logger.error(f"Unexpected error occurred: {e}")
        return _SearchResult(
            success=False,
            message=f"Unexpected error occurred: {e}",
            query_str=query_str,
            data=[],
        )
