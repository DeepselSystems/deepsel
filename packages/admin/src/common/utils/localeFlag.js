import { SVG_FLAGS_BASE_PATH, FALLBACK_FLAG_CODE } from '../../constants/attachment.js';

/**
 * Maps language ISO codes to country codes when the two differ.
 * Used when a language code alone cannot resolve to the correct flag.
 * Keep alphabetised by key; add new entries as locales are added.
 */
export const LANG_TO_COUNTRY_OVERRIDES = {
  ar: 'sa', // Arabic → Saudi Arabia
  bs: 'ba', // Bosnian → Bosnia and Herzegovina
  en: 'gb', // English → Great Britain
  fa: 'ir', // Persian/Farsi → Iran
  gl: 'es', // Galician → Spain
  gu: 'in', // Gujarati → India
  hi: 'in', // Hindi → India
  ja: 'jp', // Japanese → Japan
  ka: 'ge', // Georgian → Georgia
  kab: 'dz', // Kabyle → Algeria
  km: 'kh', // Khmer → Cambodia
  ko: 'kr', // Korean → South Korea (ko_KP handled by country-split)
  lb: 'lu', // Luxembourgish → Luxembourg
  lo: 'la', // Lao → Laos
  ml: 'in', // Malayalam → India
  ms: 'my', // Malay → Malaysia
  my: 'mm', // Burmese → Myanmar
  sl: 'si', // Slovenian → Slovenia
  sq: 'al', // Albanian → Albania
  sr: 'rs', // Serbian → Serbia
  sv: 'se', // Swedish → Sweden
  te: 'in', // Telugu → India
  tl: 'ph', // Tagalog → Philippines
  uk: 'ua', // Ukrainian → Ukraine
  vi: 'vn', // Vietnamese → Vietnam
};

/**
 * Resolves an SVG flag URL for a given locale ISO code.
 *
 * Resolution order:
 *   1. Strip script suffix (e.g. "sr@latin" → "sr")
 *   2. Check LANG_TO_COUNTRY_OVERRIDES for an exact match
 *   3. If the code contains "_", use the country part (e.g. "de_CH" → "ch")
 *   4. Use the language code directly (e.g. "de" → "de")
 *   5. Fallback to FALLBACK_FLAG_CODE if isoCode is falsy
 *
 * Note: the returned URL may still 404 for edge-case codes (e.g. "es_419").
 * Callers should handle image load errors and fall back to FALLBACK_FLAG_CODE.
 *
 * @param {string|null|undefined} isoCode - Locale ISO code (e.g. "en", "de_CH", "zh_CN")
 * @returns {string} Absolute path to the SVG flag image
 */
export function getFlagUrlForIsoCode(isoCode) {
  if (!isoCode) return `${SVG_FLAGS_BASE_PATH}/${FALLBACK_FLAG_CODE}.svg`;

  // Strip script/variant suffix: "sr@latin" → "sr"
  const normalized = isoCode.split('@')[0];

  // Explicit override takes highest priority
  if (LANG_TO_COUNTRY_OVERRIDES[normalized]) {
    return `${SVG_FLAGS_BASE_PATH}/${LANG_TO_COUNTRY_OVERRIDES[normalized]}.svg`;
  }

  const parts = normalized.toLowerCase().split('_');

  if (parts.length > 1) {
    // Use country part: "de_CH" → "ch", "zh_CN" → "cn"
    return `${SVG_FLAGS_BASE_PATH}/${parts[parts.length - 1]}.svg`;
  }

  // Simple language code: use directly
  return `${SVG_FLAGS_BASE_PATH}/${parts[0]}.svg`;
}
