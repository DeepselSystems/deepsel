from typing import Optional

from fastapi import Header, HTTPException, status


def resolve_current_organization_id(
    user,
    x_organization_id: Optional[int] = Header(default=None, alias="X-Organization-Id"),
) -> Optional[int]:
    """Resolve org context from the X-Organization-Id header.

    Returns the header value if the user is a member of that org.
    Returns None if the header is absent — caller decides whether None is allowed.
    Raises 403 if the user is not a member of the requested org.
    Never falls back to an implicit "first org".
    """
    if x_organization_id is None:
        return None
    if x_organization_id not in user.get_org_ids():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is not a member of the requested organization",
        )
    return x_organization_id
