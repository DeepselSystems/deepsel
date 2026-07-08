import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

/** Initialize i18next for theme React components. No translation files — keys are used as default strings. */
if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    lng: 'en',
    fallbackLng: 'en',
    debug: false,
    interpolation: {
      escapeValue: false,
    },
  });
}

export default i18n;
