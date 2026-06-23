import clsx from 'clsx';
import keyBy from 'lodash/keyBy';
import map from 'lodash/map';
import orderBy from 'lodash/orderBy';
import { LocaleFlag } from './LocaleFlag.jsx';

/**
 * @typedef VersionFlagBarProps
 * @property {import('../../../../typedefs/AttachmentFile.js').AttachmentLocaleVersion[]} versions - Existing locale versions for the attachment
 * @property {number|null} selectedLocaleId - Currently active locale id
 * @property {(localeId: number) => void} onSelectLocale - Called with the locale id when any flag is clicked
 * @property {number|null} defaultLocaleId - Site default locale id; its flag is sorted first
 * @property {import('../../../../typedefs/Organization.js').OrgLanguage[]} availableLanguages - All org-configured languages
 */

/**
 * @typedef FlagItem
 * @property {import('../../../../typedefs/Organization.js').OrgLanguage} lang - Locale info for display
 * @property {import('../../../../typedefs/AttachmentFile.js').AttachmentLocaleVersion|null} version - null = no file for this language yet
 */

/**
 * Renders a horizontal row of locale flag chips showing the union of
 * availableLanguages and locale_versions:
 *
 *   - Languages WITH a locale_version → active flag (clickable, switches preview)
 *   - Languages WITHOUT a locale_version → grayed flag (still clickable; card shows placeholder)
 *   - locale_versions whose locale is NOT in availableLanguages → appended at the end
 *
 * When availableLanguages is empty (not yet loaded), falls back to showing only
 * the existing locale_versions.
 *
 * Dimming: the bar is dimmed only when there is exactly 1 active version and no
 * no-file placeholders (nothing to switch to and nothing to signal as missing).
 *
 * @param {VersionFlagBarProps} props
 */
export function VersionFlagBar({
  versions,
  selectedLocaleId,
  onSelectLocale,
  defaultLocaleId,
  availableLanguages,
}) {
  // Nothing to render when neither versions nor available languages are known yet
  const hasVersions = versions && versions.length > 0;
  const hasAvailableLanguages = availableLanguages && availableLanguages.length > 0;
  if (!hasVersions && !hasAvailableLanguages) return null;

  // Quick lookup: locale_id → locale_version (for versions that exist)
  const versionByLocaleId = keyBy(
    versions.filter((v) => v.locale_id != null),
    'locale_id',
  );

  /** @type {FlagItem[]} */
  let items;

  if (hasAvailableLanguages) {
    // Union: all org-configured languages + orphan versions not in available list
    const configuredLocaleIds = new Set(map(availableLanguages, 'id'));

    items = [
      // All available_languages in their configured order
      ...availableLanguages.map((lang) => ({
        lang,
        version: versionByLocaleId[lang.id] ?? null,
      })),
      // Orphan versions: exist in the attachment but not in available_languages
      ...versions
        .filter((v) => v.locale_id == null || !configuredLocaleIds.has(v.locale_id))
        .map((v) => ({
          lang: v.locale ?? { id: v.locale_id, name: 'Unknown', iso_code: null },
          version: v,
        })),
    ];
  } else {
    // Fallback when org settings not loaded yet: show only existing versions
    items = versions.map((v) => ({
      lang: v.locale ?? { id: v.locale_id, name: 'Unknown', iso_code: null },
      version: v,
    }));
  }

  // Sort: default locale first; orderBy iteratee returns 0 for default, 1 for rest
  items = orderBy(items, [
    (item) => {
      const id = item.version?.locale_id ?? item.lang?.id;
      return id === defaultLocaleId ? 0 : 1;
    },
  ]);

  const activeCount = items.filter(({ version }) => version != null).length;
  const noFileCount = items.filter(({ version }) => version == null).length;

  // Dim only when there is 1 active version and nothing else to communicate
  const dimBar = activeCount <= 1 && noFileCount === 0;

  return (
    <div
      className={clsx(
        'flex flex-wrap gap-1 px-2 py-1.5 border-t border-gray-100',
        dimBar && 'opacity-60',
      )}
    >
      {items.map(({ lang, version }) => (
        <LocaleFlag
          key={lang?.id ?? lang?.iso_code ?? lang?.name}
          locale={lang}
          selected={lang?.id === selectedLocaleId}
          noFile={version == null}
          onClick={(e) => {
            e.stopPropagation();
            if (lang?.id != null) onSelectLocale(lang.id);
          }}
        />
      ))}
    </div>
  );
}
