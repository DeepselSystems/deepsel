import { useState, useMemo } from 'react';
import { pickDefaultVersion } from '../utils/versionSelector.js';

/**
 * @typedef UseSelectedVersionResult
 * @property {import('../../typedefs/AttachmentFile.js').AttachmentLocaleVersion|null} selectedVersion - Version for the selected locale; null when locale has no file yet
 * @property {number|null} selectedLocaleId - Currently selected locale id (resolved)
 * @property {(localeId: number) => void} setSelectedLocale - Select a locale by id
 * @property {import('../../typedefs/AttachmentFile.js').AttachmentLocaleVersion[]} availableVersions - All locale versions for this attachment
 */

/**
 * Manages which locale is currently displayed on an attachment card.
 *
 * Tracks selection by locale id (not version id) so that clicking a locale
 * with no uploaded file is supported — selectedVersion will be null in that case,
 * and the card shows a placeholder instead of a file preview.
 *
 * Selection logic:
 *   - Defaults to the locale matching defaultLocaleId (site default language)
 *   - Falls back to the locale of the version with the lowest id
 *   - Explicit user selection overrides auto-pick and survives re-renders
 *
 * @param {import('../../typedefs/AttachmentFile.js').AttachmentLocaleVersion[]} versions
 * @param {number|null} defaultLocaleId
 * @returns {UseSelectedVersionResult}
 */
export function useSelectedVersion(versions, defaultLocaleId) {
  // null = auto-pick; set to a specific locale id on explicit user selection
  const [selectedLocaleId, setSelectedLocaleId] = useState(null);

  // Resolved locale id: explicit selection or auto-picked default
  const resolvedLocaleId = useMemo(() => {
    if (selectedLocaleId !== null) return selectedLocaleId;
    return pickDefaultVersion(versions, defaultLocaleId)?.locale_id ?? null;
  }, [selectedLocaleId, versions, defaultLocaleId]);

  // The version for the resolved locale (null if no file uploaded for this locale)
  const selectedVersion = useMemo(() => {
    if (resolvedLocaleId == null) return null;
    return versions.find((v) => v.locale_id === resolvedLocaleId) ?? null;
  }, [resolvedLocaleId, versions]);

  return {
    selectedVersion,
    selectedLocaleId: resolvedLocaleId,
    setSelectedLocale: setSelectedLocaleId,
    availableVersions: versions,
  };
}
