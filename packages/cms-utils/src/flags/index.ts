/** Base path for flag SVG assets — must be served from the consumer's public directory */
const DEFAULT_FLAGS_BASE_PATH = '/flags';

/** ISO code used when no matching flag is found */
const FALLBACK_ISO_CODE = 'un';

/**
 * Returns the public URL for the SVG flag matching the given locale ISO code.
 *
 * The SVG files must be present in the consumer app's public directory under
 * the base path (default: /flags/{isoCode}.svg). Files are named by iso_code
 * exactly as stored in the locale table (e.g. en.svg, zh_CN.svg, es_419.svg).
 *
 * Falls back to un.svg (UN flag) when isoCode is falsy or contains "@".
 *
 * @param isoCode - Locale ISO code as stored in the locale table (e.g. "en", "zh_CN")
 * @param basePath - Base URL path where flag SVGs are served (default: "/flags")
 * @returns Public URL string for the SVG flag image
 */
export function getFlagUrl(isoCode: string, basePath: string = DEFAULT_FLAGS_BASE_PATH): string {
  if (!isoCode || isoCode.includes('@')) {
    return `${basePath}/${FALLBACK_ISO_CODE}.svg`;
  }
  return `${basePath}/${isoCode}.svg`;
}
