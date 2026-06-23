/**
 * Picks the default locale version to display for an attachment.
 *
 * Selection order:
 *   1. Version matching defaultLocaleId (site default language)
 *   2. First version sorted by id ascending (oldest = most canonical)
 *   3. null if versions is empty
 *
 * @param {import('../../typedefs/AttachmentFile.js').AttachmentLocaleVersion[]} versions
 * @param {number|null} defaultLocaleId - The site's default locale id from org settings
 * @returns {import('../../typedefs/AttachmentFile.js').AttachmentLocaleVersion|null}
 */
export function pickDefaultVersion(versions, defaultLocaleId) {
  if (!versions || versions.length === 0) return null;

  if (defaultLocaleId != null) {
    const match = versions.find((v) => v.locale_id === defaultLocaleId);
    if (match) return match;
  }

  return [...versions].sort((a, b) => a.id - b.id)[0];
}
