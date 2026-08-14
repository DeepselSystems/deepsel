import { useMemo } from 'react';
import { getLanguageUrl } from '@deepsel/cms-utils';
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

    return websiteData?.settings?.default_language?.iso_code;
  }, [websiteData?.data?.lang, websiteData?.settings?.default_language?.iso_code]);

  const availableLanguages = useMemo(
    () => websiteData?.settings?.available_languages || [],
    [websiteData?.settings?.available_languages],
  );

  const setLanguage = (targetLangCode: string) => {
    // Navigate to the language-specific URL
    if (!websiteData || typeof window === 'undefined') {
      return;
    }

    window.location.href = getLanguageUrl(
      websiteData.data,
      window.location.pathname,
      targetLangCode,
    );
  };

  return { language, setLanguage, availableLanguages } as const;
}
