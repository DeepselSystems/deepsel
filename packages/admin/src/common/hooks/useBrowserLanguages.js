import { useMemo } from 'react';

/**
 * Get the user's preferred browser languages.
 *
 * Returns the browser languages in the following priority:
 * 1. navigator.language (primary language)
 * 2. navigator.languages[0] (first preferred language)
 * 3. navigator.userLanguage (IE fallback)
 * 4. 'en' (default fallback)
 *
 * @param {{fallbackLang: string}} options
 * @returns {Array<string>}  Array of language codes in order of preference.
 */
const useBrowserLanguages = (options = { fallbackLang: 'en' }) => {
  return useMemo(() => {
    try {
      // Try different browser APIs to get language
      return [
        navigator.language,
        ...(navigator.languages || []),
        navigator.userLanguage, // IE fallback
        options.fallbackLang,
      ].filter(Boolean);
    } catch (err) {
      console.error('Failed to detect browser language:', err);
      return options.fallbackLang ? [options.fallbackLang] : [];
    }
  }, [options.fallbackLang]);
};

export default useBrowserLanguages;
