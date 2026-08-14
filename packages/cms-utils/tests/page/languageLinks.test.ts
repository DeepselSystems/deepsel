import { describe, expect, it } from 'vitest';
import { buildLanguageLinks, getLanguageUrl } from '../../src/page/languageLinks';
import type { LanguageLinkSource } from '../../src/page/languageLinks';

const settings = {
  default_language: { id: 1, name: 'German / Deutsch', iso_code: 'de' },
  available_languages: [
    { id: 1, name: 'German / Deutsch', iso_code: 'de' },
    { id: 2, name: 'English / English', iso_code: 'en' },
    { id: 3, name: 'French / Français', iso_code: 'fr' },
  ],
} as LanguageLinkSource['public_settings'];

/** A page whose slug differs in every language. */
const translatedPage: LanguageLinkSource = {
  lang: 'de',
  public_settings: settings,
  language_alternatives: [
    { locale: { iso_code: 'de' }, slug: '/webagentur-zuerich' },
    { locale: { iso_code: 'en' }, slug: '/web-agency-zurich' },
    { locale: { iso_code: 'fr' }, slug: '/agence-web-zurich' },
  ] as LanguageLinkSource['language_alternatives'],
};

/** Template-driven content: no alternatives, path is language-neutral. */
const templatePage: LanguageLinkSource = { lang: 'de', public_settings: settings };

describe('getLanguageUrl', () => {
  it('uses the translated slug of the target language', () => {
    expect(getLanguageUrl(translatedPage, '/webagentur-zuerich', 'en')).toBe(
      '/en/web-agency-zurich',
    );
  });

  it('omits the prefix for the default language', () => {
    expect(getLanguageUrl(translatedPage, '/en/web-agency-zurich', 'de')).toBe(
      '/webagentur-zuerich',
    );
  });

  it('falls back to the current path, stripped of its language prefix', () => {
    expect(getLanguageUrl(templatePage, '/en/impressum', 'fr')).toBe('/fr/impressum');
  });

  it('has no trailing slash at the language root', () => {
    expect(getLanguageUrl(templatePage, '/', 'en')).toBe('/en');
    expect(getLanguageUrl(templatePage, '/en', 'fr')).toBe('/fr');
  });

  it('returns the bare root when switching to the default language at the root', () => {
    expect(getLanguageUrl(templatePage, '/en', 'de')).toBe('/');
  });

  it('normalises alternatives whose slug lacks a leading slash', () => {
    const data: LanguageLinkSource = {
      public_settings: settings,
      language_alternatives: [
        { locale: { iso_code: 'en' }, slug: 'web-agency-zurich' },
      ] as LanguageLinkSource['language_alternatives'],
    };
    expect(getLanguageUrl(data, '/webagentur-zuerich', 'en')).toBe('/en/web-agency-zurich');
  });

  it('ignores alternatives for other languages', () => {
    expect(getLanguageUrl(translatedPage, '/webagentur-zuerich', 'it')).toBe(
      '/it/webagentur-zuerich',
    );
  });
});

describe('buildLanguageLinks', () => {
  it('builds one link per available language and flags the current one', () => {
    expect(buildLanguageLinks(translatedPage, '/webagentur-zuerich')).toEqual([
      { iso_code: 'de', name: 'German / Deutsch', href: '/webagentur-zuerich', active: true },
      { iso_code: 'en', name: 'English / English', href: '/en/web-agency-zurich', active: false },
      { iso_code: 'fr', name: 'French / Français', href: '/fr/agence-web-zurich', active: false },
    ]);
  });

  it('falls back to the default language when the content has no lang', () => {
    const links = buildLanguageLinks({ ...templatePage, lang: undefined }, '/');
    expect(links.find((link) => link.active)?.iso_code).toBe('de');
  });

  it('marks the active language from the content lang, not the path', () => {
    const links = buildLanguageLinks({ ...translatedPage, lang: 'en' }, '/en/web-agency-zurich');
    expect(links.find((link) => link.active)?.iso_code).toBe('en');
  });

  it('returns an empty list when settings are missing', () => {
    expect(buildLanguageLinks(undefined, '/')).toEqual([]);
    expect(buildLanguageLinks({}, '/')).toEqual([]);
  });
});
