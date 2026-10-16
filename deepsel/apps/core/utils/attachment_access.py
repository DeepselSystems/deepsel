"""Who may load an attachment file, and how to hand one out.

`GET {API_PREFIX}/attachment/serve/{file_name}` and `.../serve-by-name/{name}`
answer when ANY of these holds:

1. the attachment is **public**: its own `public` flag, or, while that flag is
   NULL, the consumer's `ATTACHMENT_DEFAULT_VISIBILITY` ("private" when unset);
2. the URL carries a valid **signature** for that file name (`sign_serve_url`):
   a capability link for a page or an email that a logged-out reader opens,
   optionally expiring;
3. the caller is **signed in** (session cookie, which is what an `<img src>`
   sends, or a Bearer token) and may read that attachment under the role
   scopes of the `attachment` table: `*` any, `org` an org they belong to
   (narrowed to the X-Organization-Id org when one is sent), `own` their own.

Anything else is 401 (nobody signed in) or 404 (signed in, not allowed: the
same answer as a file that does not exist, so names do not leak across orgs).

Consumer settings (all optional, read from `deps.settings`):

- `ATTACHMENT_DEFAULT_VISIBILITY`: "private" (default) or "public". A public
  website (the cms app) sets "public"; a back-office app keeps "private" and
  marks the few files that must load logged-out (`public=true` on upload or on
  `PUT /attachment/{id}`), or signs links to them.
- `ATTACHMENT_RANDOM_NAMES`: True (default) appends a random suffix to every
  new stored file name ("quote-3f9c0b1e7a2d4c55.pdf"), so names cannot be
  guessed; False keeps the sanitized original name (SEO-friendly media).
- `ATTACHMENT_SIGNED_URL_TTL`: default lifetime in seconds of a signed link
  (7 days).
"""

import base64
import hashlib
import hmac
import os
import secrets
import time
from typing import Optional

from deepsel import deps

VISIBILITY_PUBLIC = "public"
VISIBILITY_PRIVATE = "private"
DEFAULT_SIGNED_URL_TTL = 7 * 24 * 3600
_RANDOM_SUFFIX_BYTES = 8  # 16 hex characters, 64 bits


def _setting(name: str, default):
    return getattr(getattr(deps, "settings", None), name, default)


def default_visibility() -> str:
    value = str(_setting("ATTACHMENT_DEFAULT_VISIBILITY", VISIBILITY_PRIVATE) or "")
    return (
        VISIBILITY_PUBLIC
        if value.strip().lower() == VISIBILITY_PUBLIC
        else VISIBILITY_PRIVATE
    )


def random_names_enabled() -> bool:
    value = _setting("ATTACHMENT_RANDOM_NAMES", True)
    if isinstance(value, str):
        return value.strip().lower() not in ("false", "0", "no", "off", "")
    return bool(value)


def signed_url_ttl() -> int:
    try:
        return int(_setting("ATTACHMENT_SIGNED_URL_TTL", DEFAULT_SIGNED_URL_TTL))
    except (TypeError, ValueError):
        return DEFAULT_SIGNED_URL_TTL


def is_public(attachment) -> bool:
    """The attachment's own flag, else the consumer's default visibility."""
    flag = getattr(attachment, "public", None)
    if flag is not None:
        return bool(flag)
    return default_visibility() == VISIBILITY_PUBLIC


def with_random_suffix(filename: str) -> str:
    """ "Quote.pdf" -> "Quote-3f9c0b1e7a2d4c55.pdf"."""
    base, ext = os.path.splitext(filename or "")
    suffix = secrets.token_hex(_RANDOM_SUFFIX_BYTES)
    return f"{base or 'file'}-{suffix}{ext}"


# ---------------------------------------------------------------------------
# signed links
# ---------------------------------------------------------------------------


def _signature(file_name: str, expires: int, by_name: bool = False) -> str:
    secret = str(_setting("APP_SECRET", "") or "")
    if not secret:
        raise RuntimeError("APP_SECRET is required to sign attachment links")
    # the route is part of the message: a link for one cannot open the other
    route = "serve-by-name" if by_name else "serve"
    digest = hmac.new(
        secret.encode(),
        f"attachment-{route}:{file_name}:{expires}".encode(),
        hashlib.sha256,
    ).digest()
    return base64.urlsafe_b64encode(digest[:24]).decode().rstrip("=")


def sign_serve_url(
    file_name: str,
    expires_in: Optional[int] = -1,
    *,
    by_name: bool = False,
    prefix: Optional[str] = None,
) -> str:
    """A serve URL that loads without signing in. `file_name` is the stored
    file (`attachment_locale_version.name`, the `/serve/` route) or, with
    `by_name=True`, the attachment's `name` (the `/serve-by-name/` route).
    `expires_in` seconds (default `ATTACHMENT_SIGNED_URL_TTL`); `None` never
    expires (an emailed image). `prefix` defaults to `{API_PREFIX}/attachment`."""
    if expires_in == -1:
        expires_in = signed_url_ttl()
    expires = 0 if expires_in is None else int(time.time()) + int(expires_in)
    base = prefix or f"{_setting('API_PREFIX', '/api/v1')}/attachment"
    route = "serve-by-name" if by_name else "serve"
    sig = _signature(file_name, expires, by_name)
    return f"{base}/{route}/{file_name}?exp={expires}&sig={sig}"


def verify_signature(
    file_name: str, exp: Optional[str], sig: Optional[str], by_name: bool = False
) -> bool:
    if not exp or not sig:
        return False
    try:
        expires = int(exp)
    except (TypeError, ValueError):
        return False
    if expires != 0 and expires < int(time.time()):
        return False
    try:
        expected = _signature(file_name, expires, by_name)
    except RuntimeError:
        return False
    return hmac.compare_digest(expected, sig)


# ---------------------------------------------------------------------------
# signed-in access
# ---------------------------------------------------------------------------


def can_view(user, attachment, model=None) -> bool:
    """Read access to one attachment under the `attachment` table's role
    scopes, the same rule the CRUD routes apply to queries."""
    # imported here: deepsel.orm loads after deepsel.utils (import cycle)
    from deepsel.orm.types import PermissionAction, PermissionScope

    if user is None or attachment is None:
        return False
    model = model or type(attachment)
    allowed, scope = model._check_has_permission(PermissionAction.read, user)
    if not allowed:
        return False
    if scope == PermissionScope.all:
        return True
    if scope == PermissionScope.own:
        return getattr(attachment, "owner_id", None) == getattr(user, "id", None)
    if scope == PermissionScope.org:
        org_id = getattr(attachment, "organization_id", None)
        if org_id is None:
            return False
        current = getattr(user, "current_organization_id", None)
        org_ids = [current] if current is not None else list(user.get_org_ids() or [])
        return org_id in org_ids
    return False
