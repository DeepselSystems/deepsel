from typing import Optional, Any
from fastapi import APIRouter

_api_prefix: str = "/api/v1"


def set_api_prefix(prefix: str) -> None:
    """Set the default API prefix. Call this at app startup."""
    global _api_prefix
    _api_prefix = prefix


def create_api_router(
    resource: str = "", tags: Optional[list[str]] = None, **kwargs: Any
) -> APIRouter:
    """
    Create an APIRouter with automatic API prefix and versioning.

    This ensures all API routes follow the pattern: /api/v1/{resource}

    Args:
        resource: The resource name (e.g., "labels", "support_ticket")
                 If empty, only /api/v1 prefix is used
        tags: Optional list of tags for OpenAPI documentation
        **kwargs: Additional arguments passed to APIRouter

    Returns:
        APIRouter instance with the correct prefix

    Examples:
        # For /api/v1/labels/*
        router = create_api_router("labels", tags=["Labels"])

        # For /api/v1/*
        router = create_api_router(tags=["Authentication"])

        # For /api/v1/sprint/board/*
        router = create_api_router("sprint/board", tags=["Kanban Board"])
    """
    prefix = get_api_prefix(resource)
    return APIRouter(prefix=prefix, tags=tags or [], **kwargs)


def get_api_prefix(resource: str = "") -> str:
    """
    Get the full API prefix for a resource.

    Args:
        resource: The resource name

    Returns:
        Full API prefix string

    Examples:
        prefix = get_api_prefix("support_ticket")  # Returns "/api/v1/support_ticket"
        prefix = get_api_prefix()  # Returns "/api/v1"
    """
    if resource:
        resource = resource.strip("/")
        return f"{_api_prefix}/{resource}"
    return _api_prefix
