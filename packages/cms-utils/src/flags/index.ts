/** Base path where flag SVG assets are served */
const FLAGS_BASE_PATH = '/flags';

/** ISO code used when no matching flag is found */
const FALLBACK_ISO_CODE = 'un';

/**
 * Returns the public URL for the SVG flag matching the given locale ISO code.
 * SVG files are served from /flags/ (configured in each consumer app).
 * Falls back to un.svg (UN flag) when isoCode is falsy or contains "@".
 *
 * @param isoCode - Locale ISO code as stored in the locale table (e.g. "en", "zh_CN")
 */
export function getFlagUrl(isoCode: string): string {
  if (!isoCode || isoCode.includes('@')) {
    return `${FLAGS_BASE_PATH}/${FALLBACK_ISO_CODE}.svg`;
  }
  return `${FLAGS_BASE_PATH}/${isoCode}.svg`;
}
