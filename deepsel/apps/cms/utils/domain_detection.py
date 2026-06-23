"""Domain detection utility for multi-site CMS"""

from fastapi import Request


def detect_domain_from_request(request: Request) -> str:
    """
    Extract host from request headers, prioritizing x-frontend-host for SSR requests
    """

    # Check for frontend-provided host (from SSR)
    frontend_host = request.headers.get("x-frontend-host", "")
    host = request.headers.get("host", "")

    if frontend_host:
        detected_domain = frontend_host.split(":")[0]
        return detected_domain

    # Fall back to standard host header
    detected_domain = host.split(":")[0] if host else ""
    return detected_domain
