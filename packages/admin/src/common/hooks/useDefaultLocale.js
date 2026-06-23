import SitePublicSettingsState from '../stores/SitePublicSettingsState.js';

/**
 * @typedef DefaultLocaleResult
 * @property {number|null} defaultLocaleId - ID of the site's default language
 * @property {import('../../typedefs/Organization.js').OrgLanguage|null} defaultLocale - Full default locale object
 * @property {import('../../typedefs/Organization.js').OrgLanguage[]} availableLanguages - All languages configured for the org
 */

/**
 * Returns the site's default locale and available languages from SitePublicSettingsState.
 * Both values come from the org settings object stored after login.
 *
 * availableLanguages is the org-level whitelist of configured locales.
 * Use it to filter or enrich attachment locale versions in the media library.
 *
 * @returns {DefaultLocaleResult}
 */
export function useDefaultLocale() {
  const { settings } = SitePublicSettingsState((state) => state);
  const defaultLocale = settings?.default_language ?? null;
  const defaultLocaleId = defaultLocale?.id ?? settings?.default_language_id ?? null;
  const availableLanguages = settings?.available_languages ?? [];
  return { defaultLocaleId, defaultLocale, availableLanguages };
}
