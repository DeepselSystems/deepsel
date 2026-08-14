import { parseSlug } from './parseSlug.js';
import type { LanguageAlternative } from './types.js';
import type { SiteSettings } from '../types.js';

export interface LanguageLink {
  iso_code: string;
  name: string;
  /** Resolved URL for this language on the current page. */
  href: string;
  active: boolean;
}

/**
 * Minimal content shape needed to resolve language URLs.
 * Satisfied by both `PageData` and `BlogPostData`.
 */
export interface LanguageLinkSource {
  lang?: string;
  public_settings?: SiteSettings;
  language_alternatives?: LanguageAlternative[];
}

/**
 * Resolves the URL that `targetLangCode` lives at, for the content currently
 * served at `pathname`.
 *
 * Two rules make a naive `/{lang}{pathname}` wrong:
 * slugs are translated per language (`/webagentur-zuerich` ->
 * `/en/web-agency-zurich`), so the target comes from `language_alternatives`;
 * and the default language is served unprefixed, so switching back to it must
 * drop the prefix entirely.
 */
export function getLanguageUrl(
  data: LanguageLinkSource | null | undefined,
  pathname: string,
  targetLangCode: string,
): string {
  const defaultIsoCode = data?.public_settings?.default_language?.iso_code;

  const alternative = data?.language_alternatives?.find(
    (alt) => alt.locale?.iso_code === targetLangCode,
  );
  const slug = alternative?.slug;

  let targetPath: string;
  if (slug) {
    targetPath = slug.startsWith('/') ? slug : `/${slug}`;
  } else {
    // Template-driven content carries no alternatives. Stripping the language
    // prefix off the current path leaves a language-neutral path to reuse.
    targetPath = parseSlug(pathname).path;
  }

  if (targetLangCode === defaultIsoCode) {
    return targetPath;
  }
  // Avoid a trailing slash on the language root so the result matches
  // theme routes declared as `/en` rather than `/en/`.
  return targetPath === '/' ? `/${targetLangCode}` : `/${targetLangCode}${targetPath}`;
}

/**
 * Builds one link per available language for the content at `pathname`, with
 * the current language flagged.
 *
 * Themes can render these as anchors instead of wiring click handlers, so the
 * targets preview on hover and support middle-click.
 */
export function buildLanguageLinks(
  data: LanguageLinkSource | null | undefined,
  pathname: string,
): LanguageLink[] {
  const settings = data?.public_settings;
  const currentIsoCode = data?.lang ?? settings?.default_language?.iso_code;

  return (settings?.available_languages ?? []).map((language) => ({
    iso_code: language.iso_code,
    name: language.name,
    href: getLanguageUrl(data, pathname, language.iso_code),
    active: language.iso_code === currentIsoCode,
  }));
}
