import json
from typing import Callable, Optional, TypedDict, Union, Any
from markupsafe import Markup, escape
from sqlalchemy.orm import Session
from deepsel.utils.models_pool import models_pool
from deepsel.deps import settings

_SERVE_URL_PREFIX = f"{settings.API_PREFIX}/attachment/serve"


_NOT_AVAILABLE_STYLE = (
    "display: inline-flex; align-items: center; justify-content: center;"
    " width: 5rem; height: 5rem; padding: 0.375rem; color: #9ca3af;"
    " font-style: italic; font-size: 0.65rem; text-align: center;"
    " border: 1px dashed #d1d5db; border-radius: 4px;"
)


def _not_available(msg: str) -> Markup:
    """Return a styled placeholder span for missing/unavailable attachments."""
    return Markup('<span class="embed-file-not-available" style="{}">{}</span>').format(
        _NOT_AVAILABLE_STYLE, msg
    )


class ImageAttrs(TypedDict, total=False):
    width: int
    height: int
    alignment: str  # "left" | "center" | "right"
    rounded: bool
    circle: bool
    inline: bool
    description: str


class AudioAttrs(TypedDict, total=False):
    width: int  # player width in px; omit for 100% width


class VideoAttrs(TypedDict, total=False):
    poster: str  # URL of the poster image shown before playback


class FileAttrs(TypedDict, total=False):
    pass


AttachmentAttrs = Union[ImageAttrs, AudioAttrs, VideoAttrs, FileAttrs, dict[str, Any]]


def _render_image(version, attrs: ImageAttrs) -> Markup:
    # Mirrors the HTML produced by enhanced-image-extension renderHTML() with default attrs.
    alignment = attrs.get("alignment", "center")
    rounded = attrs.get("rounded", True)
    circle = attrs.get("circle", False)
    inline = attrs.get("inline", False)
    width = attrs.get("width", 300)
    height = attrs.get("height", "")
    description = attrs.get("description", "")

    src = f"{_SERVE_URL_PREFIX}/{version.name}"
    alt = version.alt_text or ""

    if circle:
        img_style = "border-radius: 50%; aspect-ratio: 1; object-fit: cover;"
    elif rounded:
        img_style = "border-radius: 6px;"
    else:
        img_style = ""

    if alignment == "right":
        img_style += " margin-left: auto;"
    elif alignment == "left":
        img_style += " margin-right: auto;"
    elif alignment == "center":
        img_style += " margin: 0 auto;"

    if inline:
        wrapper_styles = {
            "left": "display: inline-block; float: left; margin: 0 1rem 1rem 0; width: fit-content;",
            "right": "display: inline-block; float: right; margin: 0 0 1rem 1rem; width: fit-content;",
            "center": "display: inline-block; float: left; margin: 0 1rem 1rem 0; width: fit-content;",
        }
    else:
        wrapper_styles = {
            "center": "display: block; text-align: center; margin: 0 auto; width: fit-content;",
            "left": "display: block; text-align: left; margin-left: 0; margin-right: auto; width: fit-content;",
            "right": "display: block; text-align: right; margin-left: auto; margin-right: 0; width: fit-content;",
        }
    wrapper_style = wrapper_styles.get(alignment, wrapper_styles["center"])

    e_src = escape(src)
    e_alt = escape(alt)
    e_width = escape(str(width))
    e_height = escape(str(height)) if height else ""
    e_description = escape(description)
    e_alignment = escape(alignment)
    e_wrapper_style = escape(wrapper_style)
    e_img_style = escape(img_style)

    img_tag = Markup('<img src="{}" alt="{}" width="{}"').format(e_src, e_alt, e_width)
    if height:
        img_tag += Markup(' height="{}"').format(e_height)
    if img_style:
        img_tag += Markup(' style="{}"').format(e_img_style)
    img_tag += Markup(">")

    description_tag = (
        Markup('<div class="enhanced-image-description">{}</div>').format(e_description)
        if description and description.strip()
        else Markup("")
    )

    return Markup(
        "<div"
        ' class="enhanced-image-wrapper"'
        ' data-enhanced-image="true"'
        ' data-alignment="{}"'
        ' data-rounded="{}"'
        ' data-circle="{}"'
        ' data-inline="{}"'
        ' data-width="{}"'
        ' data-height="{}"'
        ' data-description="{}"'
        ' style="{}"'
        ">{}{}</div>"
    ).format(
        e_alignment,
        escape(str(rounded).lower()),
        escape(str(circle).lower()),
        escape(str(inline).lower()),
        e_width,
        e_height,
        e_description,
        e_wrapper_style,
        img_tag,
        description_tag,
    )


def _render_audio(version, attrs: AudioAttrs) -> Markup:
    # Mirrors the HTML produced by embed-audio-extension renderHTML().
    src = f"{_SERVE_URL_PREFIX}/{version.name}"
    width = attrs.get("width")
    width_style = f"width: {width}px;" if width else "width: 100%;"

    e_src = escape(src)
    e_width_style = escape(width_style)

    result = Markup(
        "<div"
        ' class="embed-audio-wrapper"'
        ' data-embed-audio="true"'
        ' data-audio-src="{}"'
    ).format(e_src)
    if width:
        result += Markup(' data-audio-width="{}"').format(escape(str(width)))
    result += Markup(
        ">"
        '<div class="embed-audio-container" style="{}">'
        '<audio src="{}" controls class="embed-audio-content">'
        "Your browser does not support the audio tag."
        "</audio>"
        "</div>"
        "</div>"
    ).format(e_width_style, e_src)

    return result


def _render_video(version, attrs: VideoAttrs) -> Markup:
    # Mirrors the HTML produced by embed-video-extension renderHTML().
    src = f"{_SERVE_URL_PREFIX}/{version.name}"
    poster = attrs.get("poster", "")

    e_src = escape(src)

    result = Markup(
        "<div"
        ' class="embed-video-wrapper"'
        ' data-embed-video="true"'
        ">"
        '<div class="embed-video-container">'
        '<video src="{}" controls class="embed-video-content" style="width: 100%; height: auto;"'
    ).format(e_src)
    if poster:
        result += Markup(' poster="{}"').format(escape(poster))
    result += Markup(
        ">" "Your browser does not support the video tag." "</video>" "</div>" "</div>"
    )

    return result


def _render_file(version, attrs: FileAttrs) -> Markup:
    href = f"{_SERVE_URL_PREFIX}/{version.name}"
    display_name = version.name
    e_href = escape(href)
    e_display_name = escape(display_name)
    return Markup(
        '<div class="embed-file-item">'
        '<a href="{}" download class="embed-file-content" title="{}">'
        '<span class="embed-file-icon">📄</span>'
        '<span class="embed-file-link">{}</span>'
        "</a>"
        "</div>"
    ).format(e_href, e_display_name, e_display_name)


def _render_version(version, attrs: AttachmentAttrs) -> Markup:
    """Dispatch to the correct renderer based on content_type."""
    content_type = (version.content_type or "").lower()
    if content_type.startswith("image/"):
        return _render_image(version, attrs)
    if content_type.startswith("audio/"):
        return _render_audio(version, attrs)
    if content_type.startswith("video/"):
        return _render_video(version, attrs)
    return _render_file(version, attrs)


def _resolve_locale_version(attachment_obj, lang: Optional[str], db: Session):
    """Return the best-matching locale version for lang, falling back to the first available."""
    locale_versions = getattr(attachment_obj, "locale_versions", None) or []
    if not locale_versions:
        return None

    if lang:
        LocaleModel = models_pool.get("locale")
        if LocaleModel:
            locale = db.query(LocaleModel).filter(LocaleModel.iso_code == lang).first()
            if locale:
                matched = next(
                    (v for v in locale_versions if v.locale_id == locale.id), None
                )
                if matched:
                    return matched

    return None


def _render_gallery(
    names: tuple,
    config: dict,
    db: Session,
    organization_id: int,
    lang: Optional[str],
) -> Markup:
    """
    Render a multi-image gallery grid from a list of attachment names.
    Config keys: imagesPerRow, gap, maxWidth, rounded, captions (dict of
    attachment name -> caption text; absent/empty entries render no caption).
    Alt text is resolved from each attachment's locale version in the DB.
    """
    images_per_row = config.get("imagesPerRow", 3)
    gap = config.get("gap", 4)
    max_width = config.get("maxWidth")
    rounded = config.get("rounded", True)

    grid_style = (
        f"display: grid;"
        f" grid-template-columns: repeat({images_per_row}, 1fr);"
        f" gap: {gap}px;"
        f" margin: 1rem 0;"
    )
    if max_width:
        grid_style += f" max-width: {max_width}px; margin: 1rem auto;"

    img_border_radius = "border-radius: 6px;" if rounded else ""
    captions = config.get("captions", {}) or {}

    AttachmentModel = models_pool.get("attachment")
    if not AttachmentModel:
        return Markup("<div>Gallery unavailable</div>")

    image_parts = []
    for name in names:
        attachment_obj = (
            db.query(AttachmentModel)
            .filter(
                AttachmentModel.name == name,
                AttachmentModel.organization_id == organization_id,
            )
            .first()
        )
        if not attachment_obj:
            continue

        version = _resolve_locale_version(attachment_obj, lang, db)
        if not version:
            continue

        src = f"{_SERVE_URL_PREFIX}/{version.name}"
        alt = version.alt_text or ""

        e_src = escape(src)
        e_alt = escape(alt)
        e_img_border_radius = escape(img_border_radius)
        img_tag = Markup(
            '<img src="{}" alt="{}"'
            ' class="gallery-image"'
            ' style="width: 100%; height: auto; object-fit: cover;'
            ' aspect-ratio: 1 / 1; {}">'
        ).format(e_src, e_alt, e_img_border_radius)

        caption = (captions.get(name) or "").strip()
        caption_tag = (
            Markup(
                '<div class="gallery-image-caption"'
                ' style="padding: 8px 4px; font-size: 14px; color: #666;'
                ' text-align: center; line-height: 1.4; word-wrap: break-word;">'
                "{}</div>"
            ).format(escape(caption))
            if caption
            else Markup("")
        )
        image_parts.append(
            Markup('<div class="gallery-image-container">{}{}</div>').format(
                img_tag, caption_tag
            )
        )

    if not image_parts:
        return Markup("<div>Gallery is empty</div>")

    inner = Markup("").join(image_parts)
    return Markup(
        '<div class="gallery-container" data-gallery="true" style="{}">' "{}</div>"
    ).format(escape(grid_style), inner)


def make_attachment_func(
    db: Session,
    organization_id: int,
    lang: Optional[str],
) -> Callable[..., Markup]:
    """
    Returns a Jinja2 callable that resolves attachments by name and renders HTML.

    Single image:
        {{ attachment('my-image') }}
        {{ attachment('my-image', {'width': 500, 'alignment': 'left'}) }}

    Gallery (multiple images):
        {{ attachment('img1', 'img2', 'img3') }}
        {{ attachment('img1', 'img2', '{"imagesPerRow":3,"gap":4,"maxWidth":null,"rounded":true,"captions":{"img1":"..."}}') }}

    The last arg is treated as config when it is a dict or a JSON string starting with '{'.
    Gallery config keys: imagesPerRow, gap, maxWidth, rounded, captions (name -> caption text).
    Single-image attrs vary by content type — see each _render_* function for details.
    """

    def attachment(*args) -> Markup:
        # Separate name args from optional config (last arg as dict or JSON string).
        config: AttachmentAttrs = {}
        names = list(args)

        if names:
            last = names[-1]
            if isinstance(last, dict):
                config = last
                names = names[:-1]
            elif isinstance(last, str) and last.strip().startswith("{"):
                try:
                    config = json.loads(last)
                    names = names[:-1]
                except (json.JSONDecodeError, ValueError):
                    pass  # not valid JSON — treat as a name

        if not names:
            return _not_available("No attachment specified")

        # Gallery mode: more than one name arg.
        if len(names) > 1:
            return _render_gallery(tuple(names), config, db, organization_id, lang)

        # Single attachment mode.
        name = names[0]
        AttachmentModel = models_pool.get("attachment")
        if not AttachmentModel:
            return _not_available(f"File not found: {name}")

        attachment_obj = (
            db.query(AttachmentModel)
            .filter(
                AttachmentModel.name == name,
                AttachmentModel.organization_id == organization_id,
            )
            .first()
        )

        if not attachment_obj:
            return _not_available(f"File not found: {name}")

        version = _resolve_locale_version(attachment_obj, lang, db)
        if not version:
            return _not_available("File not available for this locale")

        return _render_version(version, config)

    return attachment
