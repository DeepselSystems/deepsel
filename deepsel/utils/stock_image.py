import logging
import os
from enum import Enum
from typing import Optional
from urllib.parse import urlencode

import httpx
from pydantic import BaseModel

logger = logging.getLogger(__name__)

UNSPLASH_API_BASE = "https://api.unsplash.com"
UNSPLASH_DEFAULT_CLIENT_ID = "OSA9-NvX_-LlT1UtdVzHoMf89Ty6XrSuIFMX5Vl4XcQ"


class StockImageProviderEnum(Enum):
    Unsplash = "Unsplash"


class _PhotoItem(BaseModel):
    provider_image_id: str
    provider: StockImageProviderEnum
    title: Optional[str]
    description: Optional[str]
    width: Optional[int]
    height: Optional[int]
    aspect_ratio: Optional[float]
    preview_src: str
    src: str
    photographer_name: Optional[str] = None
    photographer_url: Optional[str] = None
    download_location: Optional[str] = None


class _SearchResult(BaseModel):
    success: bool
    message: str
    query_str: str
    page: Optional[int] = None
    data: list[_PhotoItem]


def _get_unsplash_client_id() -> str:
    return os.environ.get("UNSPLASH_ACCESS_KEY") or UNSPLASH_DEFAULT_CLIENT_ID


def _unsplash_headers() -> dict:
    return {
        "Authorization": f"Client-ID {_get_unsplash_client_id()}",
        "Accept-Version": "v1",
        "App-Pragma": "no-cache",
    }


def _map_unsplash_item(item: dict) -> _PhotoItem:
    width = item.get("width")
    height = item.get("height")
    aspect_ratio = (width / height) if width and height else None
    user = item.get("user") or {}
    user_links = user.get("links") or {}
    urls = item.get("urls") or {}
    links = item.get("links") or {}

    return _PhotoItem(
        provider_image_id=str(item.get("id", "")),
        provider=StockImageProviderEnum.Unsplash,
        title=item.get("description") or item.get("alt_description"),
        description=item.get("alt_description"),
        width=width,
        height=height,
        aspect_ratio=aspect_ratio,
        preview_src=urls.get("small", ""),
        src=urls.get("regular", ""),
        photographer_name=user.get("name"),
        photographer_url=user_links.get("html"),
        download_location=links.get("download_location"),
    )


def _unsplash_error_message(response: httpx.Response) -> str:
    if response.status_code == 401:
        return (
            "Unsplash rejected client id. Set UNSPLASH_ACCESS_KEY to a valid "
            "Unsplash Access Key."
        )
    if response.status_code == 403:
        remaining = response.headers.get("X-Ratelimit-Remaining")
        if remaining == "0":
            return (
                "Unsplash rate limit exceeded. Try again later, or register a "
                "production Unsplash app for a higher quota."
            )
        return f"Unsplash returned 403: {response.text[:200]}"
    return f"Unsplash HTTP {response.status_code}: {response.text[:200]}"


def search_unsplash_provider(
    query_str: str, page: int = 1, per_page: int = 24
) -> _SearchResult:
    query_str = (query_str or "").strip()

    if query_str:
        params = {"query": query_str, "page": page, "per_page": per_page}
        url = f"{UNSPLASH_API_BASE}/search/photos?{urlencode(params)}"
    else:
        params = {"page": page, "per_page": per_page, "order_by": "popular"}
        url = f"{UNSPLASH_API_BASE}/photos?{urlencode(params)}"

    try:
        with httpx.Client(follow_redirects=True) as client:
            response = client.get(url, headers=_unsplash_headers(), timeout=10)
            if response.status_code >= 400:
                logger.warning(
                    "Unsplash search failed (%s): %s",
                    response.status_code,
                    response.text[:200],
                )
                return _SearchResult(
                    success=False,
                    message=_unsplash_error_message(response),
                    query_str=query_str,
                    page=page,
                    data=[],
                )

            payload = response.json()
            items = payload.get("results", payload) if query_str else payload
            if not isinstance(items, list):
                items = []

            return _SearchResult(
                success=True,
                message="Success",
                query_str=query_str,
                page=page,
                data=[_map_unsplash_item(item) for item in items],
            )
    except httpx.RequestError as e:
        logger.error("Unsplash request error: %s", e)
        return _SearchResult(
            success=False,
            message=f"Request error: {e}",
            query_str=query_str,
            page=page,
            data=[],
        )
    except Exception as e:
        logger.exception("Unexpected error searching Unsplash")
        return _SearchResult(
            success=False,
            message=f"Unexpected error: {e}",
            query_str=query_str,
            page=page,
            data=[],
        )


def track_unsplash_download(download_location: str) -> bool:
    """Fire the Unsplash download-tracking event. Required by Unsplash API TOS."""
    if not download_location or not download_location.startswith(
        "https://api.unsplash.com/"
    ):
        logger.warning(
            "Refusing to track invalid download_location: %r", download_location
        )
        return False

    try:
        with httpx.Client(follow_redirects=True) as client:
            response = client.get(
                download_location, headers=_unsplash_headers(), timeout=10
            )
            if response.status_code >= 400:
                logger.warning(
                    "Unsplash download-tracking returned %s: %s",
                    response.status_code,
                    response.text[:200],
                )
                return False
            return True
    except Exception as e:
        logger.warning("Unsplash download-tracking failed: %s", e)
        return False
