from typing import Optional
from deepsel.utils.models_pool import models_pool

AttachmentModel = models_pool["attachment"]
AttachmentLocaleVersionModel = models_pool["attachment_locale_version"]


def resolve_attachment_locale_version(
    attachment: Optional[AttachmentModel],
    target_lang: str,
) -> Optional[AttachmentLocaleVersionModel]:
    """
    Return the AttachmentLocaleVersionModel for target_lang.
    Falls back to the first available version if no exact match.
    Returns None when the attachment has no locale versions.
    """
    if not attachment or not attachment.locale_versions:
        return None
    for v in attachment.locale_versions:
        if v.locale.iso_code == target_lang:
            return v
    return attachment.locale_versions[0]
