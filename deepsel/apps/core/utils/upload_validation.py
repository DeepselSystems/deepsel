"""Server-side validation for uploaded files.

RB-17: `POST /attachment` used to accept any content type and never enforced
`UPLOAD_SIZE_LIMIT`, which `GET /attachment/config/upload_size_limit` merely
reported — the only filter was the admin UI's client-side `accept` attribute.

Kept free of model imports so it can be imported (and unit-tested) without a
populated `models_pool`.
"""

import os

from fastapi import HTTPException, UploadFile, status

from settings import UPLOAD_SIZE_LIMIT

# Media + documents only; scripts, markup, archives and executables stay out.
# A consumer widens or narrows this with `ALLOWED_UPLOAD_EXTENSIONS` in its
# settings module.
DEFAULT_ALLOWED_UPLOAD_EXTENSIONS = frozenset(
    {
        # images
        ".avif",
        ".bmp",
        ".gif",
        ".heic",
        ".ico",
        ".jpeg",
        ".jpg",
        ".png",
        ".svg",
        ".tif",
        ".tiff",
        ".webp",
        # documents
        ".doc",
        ".docx",
        ".odp",
        ".ods",
        ".odt",
        ".pdf",
        ".ppt",
        ".pptx",
        ".rtf",
        ".xls",
        ".xlsx",
        # audio / video
        ".aac",
        ".avi",
        ".flac",
        ".flv",
        ".m4a",
        ".mkv",
        ".mov",
        ".mp3",
        ".mp4",
        ".mpeg",
        ".mpg",
        ".mpga",
        ".ogg",
        ".opus",
        ".wav",
        ".weba",
        ".webm",
        ".wmv",
        # fonts
        ".otf",
        ".ttf",
        ".woff",
        ".woff2",
    }
)


def allowed_upload_extensions() -> frozenset:
    from deepsel import deps

    configured = getattr(deps.settings, "ALLOWED_UPLOAD_EXTENSIONS", None)
    if not configured:
        return DEFAULT_ALLOWED_UPLOAD_EXTENSIONS
    return frozenset(
        ext.lower() if ext.startswith(".") else f".{ext.lower()}" for ext in configured
    )


def upload_size_limit_mb() -> float:
    from deepsel import deps

    return float(getattr(deps.settings, "UPLOAD_SIZE_LIMIT", UPLOAD_SIZE_LIMIT))


def validate_upload(file: UploadFile) -> int:
    """Reject an unsupported file type or an oversized file; return its size.

    Raises 400 rather than 413 so a caller gets one status for "this upload is
    not acceptable", which is what the admin UI reports.
    """
    allowed = allowed_upload_extensions()
    extension = os.path.splitext(file.filename or "")[1].lower()
    if extension not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"File type '{extension or file.filename}' is not allowed. "
                f"Allowed types: {', '.join(sorted(allowed))}"
            ),
        )

    file.file.seek(0, os.SEEK_END)
    size = file.file.tell()
    file.file.seek(0)

    limit_mb = upload_size_limit_mb()
    if size > limit_mb * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File {file.filename} exceeds the {limit_mb}MB limit",
        )

    return size
