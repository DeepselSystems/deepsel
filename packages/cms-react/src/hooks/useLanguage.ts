import { useMemo } from 'react';
import { parseSlug, type LanguageAlternative } from '@deepsel/cms-utils';
import { useWebsiteData } from '../contexts/index.js';

/**
 * React hook to read and change the current language.
 *
 * - `language` is derived from `pageData.lang` or the site's default language.
 * - `setLanguage` updates the URL based on the current page and its language alternatives.
 */
export function useLanguage() {
  const { websiteData } = useWebsiteData();

  const language = useMemo(() => {
    if (websiteData?.data?.lang) {
      return websiteData.data.lang;
    }

    return websiteData?.settings?.default_language.iso_code;
  }, [websiteData?.data?.lang, websiteData?.settings?.default_language.iso_code]);

  const availableLanguages = useMemo(
    () => websiteData?.settings?.available_languages || [],
    [websiteData?.settings?.available_languages],
  );

  const setLanguage = (targetLangCode: string) => {
    // Change the URL to match new language
    // Data fetching is handled by useTransition automatically
    if (!websiteData || typeof window === 'undefined') {
      return;
    }

    // For pages and blog posts: Use language_alternatives metadata to get language-specific slugs
    let targetPath: string | null = null;
    const { path: currentPath } = parseSlug(window.location.pathname);

    if (
      websiteData?.data &&
      'language_alternatives' in websiteData.data &&
      websiteData.data.language_alternatives?.length
    ) {
      const targetAlternative: LanguageAlternative | undefined =
        websiteData.data.language_alternatives.find(
          (alt: any) => alt.locale?.iso_code === targetLangCode,
        );

      if (targetAlternative?.slug) {
        targetPath = targetAlternative.slug.startsWith('/')
          ? targetAlternative.slug
          : `/${targetAlternative.slug}`;
      }
    }

    // Fallback to current path if no specific content found
    if (!targetPath) {
      targetPath = currentPath;
    }

    // Build final URL
    const finalUrl =
      targetLangCode !== websiteData?.settings?.default_language.iso_code
        ? `/${targetLangCode}${targetPath}`
        : targetPath;

    // Just update the URL, useTransition will handle fetching new data
    window.history.pushState(null, '', finalUrl);
  };

  return { language, setLanguage, availableLanguages } as const;
}
