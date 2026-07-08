import { themeMap, themeSystemKeys, type ThemeName } from '../themes';
import type {
  PageData,
  BlogListData,
  BlogPostData,
  SearchResultsData,
  SiteSettings,
  FormData,
  FormStatisticsData,
} from '@deepsel/cms-utils';

const systemKeys = new Set(Object.values(themeSystemKeys));

/**
 * Validates a theme key against themeMap. Prefers the per-org overlay key
 * (`<theme>__<org_id>`) when present, falls back to the base theme name,
 * then to the first available theme.
 */
export function resolveThemeName(
  themeKey: string | undefined | null,
  selectedTheme?: string | undefined | null,
): ThemeName {
  if (themeKey && themeKey in themeMap) {
    return themeKey as ThemeName;
  }
  if (selectedTheme && selectedTheme in themeMap) {
    return selectedTheme as ThemeName;
  }
  const fallback = Object.keys(themeMap)[0] as ThemeName;
  console.warn(
    `[CMS] Theme key "${themeKey}" / selected "${selectedTheme}" not found in themeMap. Falling back to "${fallback}".`,
  );
  return fallback;
}

function getSelectedThemeSettings(
  data: PageData | BlogListData | BlogPostData | SearchResultsData,
) {
  const publicSettings = data.public_settings;
  const selectedTheme = resolveThemeName(
    (publicSettings as { theme_key?: string } | undefined)?.theme_key,
    publicSettings?.selected_theme,
  );
  const defaultLangIsoCode = publicSettings?.default_language?.iso_code;
  return { selectedTheme, defaultLangIsoCode };
}

/**
 * Quick check: does ANY theme have a custom client component for this slug?
 * Used to decide whether to skip the backend fetch entirely.
 */
export function isAnyThemeClientPage(slug: string): boolean {
  const normalizedSlug = slug.replace(/^\//, '').toLowerCase() || '';
  if (!normalizedSlug || systemKeys.has(normalizedSlug)) return false;
  for (const themeName of Object.keys(themeMap) as ThemeName[]) {
    const component = themeMap[themeName]?.[normalizedSlug];
    if (component && component !== themeMap[themeName][themeSystemKeys.Page]) return true;
  }
  return false;
}

/**
 * Check if a slug has a client-only theme component (not a system key like index/blog/404).
 * Returns the component if found, null otherwise.
 */
export function getClientPageTheme(
  slug: string,
  selectedTheme: string,
  lang?: string,
  defaultLangIsoCode?: string,
): any {
  const resolvedTheme = resolveThemeName(selectedTheme);
  const normalizedSlug = slug.replace(/^\//, '').toLowerCase() || '';
  if (!normalizedSlug || systemKeys.has(normalizedSlug)) return null;

  const isNonDefaultLang = lang && defaultLangIsoCode && lang !== defaultLangIsoCode;
  const langPrefix = isNonDefaultLang ? `${lang}:` : '';

  const component =
    (langPrefix && themeMap[resolvedTheme]?.[`${langPrefix}${normalizedSlug}`]) ||
    themeMap[resolvedTheme]?.[normalizedSlug];

  if (component && component !== themeMap[resolvedTheme][themeSystemKeys.Page]) return component;
  return null;
}

/**
 * Build minimal PageData for a client-only page (no backend fetch needed).
 * Generates a title from the slug for SEO metadata.
 */
export function buildClientPageData(slug: string, publicSettings: SiteSettings): PageData {
  const normalizedSlug = slug.replace(/^\//, '');
  const title = normalizedSlug
    ? normalizedSlug.charAt(0).toUpperCase() + normalizedSlug.slice(1).replace(/-/g, ' ')
    : '';

  return {
    slug: `/${normalizedSlug}`,
    public_settings: publicSettings,
    clientPage: true,
    seo_metadata: {
      title: title || undefined,
    },
  } as PageData;
}

export function getHomeThemeComponent(data: PageData, lang?: string): any {
  const { selectedTheme, defaultLangIsoCode } = getSelectedThemeSettings(data);
  const isNonDefaultLang = lang && defaultLangIsoCode && lang !== defaultLangIsoCode;
  const langPrefix = isNonDefaultLang ? `${lang}:` : '';

  return (
    themeMap[selectedTheme][`${langPrefix}${themeSystemKeys.Home}`] ||
    themeMap[selectedTheme][themeSystemKeys.Home] ||
    themeMap[selectedTheme][themeSystemKeys.Page]
  );
}

export function getPageThemeComponent(data: PageData, lang?: string): any {
  let ThemeComponent: any;

  const { selectedTheme, defaultLangIsoCode } = getSelectedThemeSettings(data);
  const pageSlug = data.slug?.replace(/^\//, '').toLowerCase() || '';
  const isNonDefaultLang = lang && defaultLangIsoCode && lang !== defaultLangIsoCode;
  const langPrefix = isNonDefaultLang ? `${lang}:` : '';

  if (data.notFound) {
    // For notFound, use the 404 template
    ThemeComponent =
      themeMap[selectedTheme][`${langPrefix}${themeSystemKeys.NotFound}`] ||
      themeMap[selectedTheme][themeSystemKeys.NotFound];
  } else {
    // For other pages, try match the page slug, fall back to page template
    ThemeComponent =
      themeMap[selectedTheme][`${langPrefix}${pageSlug}`] ||
      themeMap[selectedTheme][pageSlug] ||
      themeMap[selectedTheme][themeSystemKeys.Page];
  }

  return ThemeComponent;
}

export function getBlogListThemeComponent(data: BlogListData, lang?: string): any {
  const { selectedTheme, defaultLangIsoCode } = getSelectedThemeSettings(data);
  const isNonDefaultLang = lang && defaultLangIsoCode && lang !== defaultLangIsoCode;
  const langPrefix = isNonDefaultLang ? `${lang}:` : '';

  // component key will be eg. "en:blog" or just "blog"
  return (
    themeMap[selectedTheme][`${langPrefix}${themeSystemKeys.BlogList}`] ||
    themeMap[selectedTheme][themeSystemKeys.BlogList]
  );
}

export function getBlogPostThemeComponent(data: BlogPostData, lang?: string): any {
  if (data.notFound) return null;

  const { selectedTheme, defaultLangIsoCode } = getSelectedThemeSettings(data);
  const isNonDefaultLang = lang && defaultLangIsoCode && lang !== defaultLangIsoCode;
  const langPrefix = isNonDefaultLang ? `${lang}:` : '';

  // component key will be eg. "en:single-blog" or just "single-blog"
  return (
    themeMap[selectedTheme][`${langPrefix}${themeSystemKeys.BlogPost}`] ||
    themeMap[selectedTheme][themeSystemKeys.BlogPost]
  );
}

export function getSearchThemeComponent(data: SearchResultsData, lang?: string): any {
  const { selectedTheme, defaultLangIsoCode } = getSelectedThemeSettings(data);
  const isNonDefaultLang = lang && defaultLangIsoCode && lang !== defaultLangIsoCode;
  const langPrefix = isNonDefaultLang ? `${lang}:` : '';

  // component key will be eg. "en:search" or just "search"
  return (
    themeMap[selectedTheme][`${langPrefix}${themeSystemKeys.SearchResults}`] ||
    themeMap[selectedTheme][themeSystemKeys.SearchResults]
  );
}

export function getFormThemeComponent(data: FormData, lang?: string): any {
  const publicSettings = data.public_settings;
  const selectedTheme = resolveThemeName(
    (publicSettings as { theme_key?: string } | undefined)?.theme_key,
    publicSettings?.selected_theme,
  );
  const defaultLangIsoCode = publicSettings?.default_language?.iso_code;
  const isNonDefaultLang = lang && defaultLangIsoCode && lang !== defaultLangIsoCode;
  const langPrefix = isNonDefaultLang ? `${lang}:` : '';

  return (
    themeMap[selectedTheme]?.[`${langPrefix}${themeSystemKeys.Form}`] ||
    themeMap[selectedTheme]?.[themeSystemKeys.Form] ||
    null
  );
}

export function getFormStatisticsThemeComponent(data: FormStatisticsData, lang?: string): any {
  const publicSettings = data.public_settings;
  const selectedTheme = resolveThemeName(
    (publicSettings as { theme_key?: string } | undefined)?.theme_key,
    publicSettings?.selected_theme,
  );
  const defaultLangIsoCode = publicSettings?.default_language?.iso_code;
  const isNonDefaultLang = lang && defaultLangIsoCode && lang !== defaultLangIsoCode;
  const langPrefix = isNonDefaultLang ? `${lang}:` : '';

  return (
    themeMap[selectedTheme]?.[`${langPrefix}${themeSystemKeys.FormStatistics}`] ||
    themeMap[selectedTheme]?.[themeSystemKeys.FormStatistics] ||
    null
  );
}

/**
 * Fallback: returns the theme's 404 component when the primary component can't be resolved.
 */
export function getNotFoundFallbackComponent(
  data: PageData | BlogListData | BlogPostData | SearchResultsData | null,
  lang?: string,
): any {
  if (!data?.public_settings) return null;
  const { selectedTheme, defaultLangIsoCode } = getSelectedThemeSettings(data);
  const isNonDefaultLang = lang && defaultLangIsoCode && lang !== defaultLangIsoCode;
  const langPrefix = isNonDefaultLang ? `${lang}:` : '';
  return (
    (langPrefix && themeMap[selectedTheme]?.[`${langPrefix}${themeSystemKeys.NotFound}`]) ||
    themeMap[selectedTheme]?.[themeSystemKeys.NotFound] ||
    null
  );
}
