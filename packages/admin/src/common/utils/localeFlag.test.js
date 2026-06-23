import { describe, expect, it } from 'vitest';
import { LANG_TO_COUNTRY_OVERRIDES, getFlagUrlForIsoCode } from './localeFlag';
import { FALLBACK_FLAG_CODE, SVG_FLAGS_BASE_PATH } from '../../constants/attachment';

const base = SVG_FLAGS_BASE_PATH;

describe('getFlagUrlForIsoCode', () => {
  it('returns the fallback flag for falsy input', () => {
    expect(getFlagUrlForIsoCode('')).toBe(`${base}/${FALLBACK_FLAG_CODE}.svg`);
    expect(getFlagUrlForIsoCode(null)).toBe(`${base}/${FALLBACK_FLAG_CODE}.svg`);
    expect(getFlagUrlForIsoCode(undefined)).toBe(`${base}/${FALLBACK_FLAG_CODE}.svg`);
  });

  it('uses an override when defined (en → gb, sv → se)', () => {
    expect(getFlagUrlForIsoCode('en')).toBe(`${base}/gb.svg`);
    expect(getFlagUrlForIsoCode('sv')).toBe(`${base}/se.svg`);
    expect(getFlagUrlForIsoCode('ja')).toBe(`${base}/jp.svg`);
  });

  it('strips a script suffix before applying overrides (sr@latin → rs)', () => {
    expect(getFlagUrlForIsoCode('sr@latin')).toBe(`${base}/rs.svg`);
    // sr (no script) also resolves to rs through the override map
    expect(getFlagUrlForIsoCode('sr')).toBe(`${base}/rs.svg`);
  });

  it('falls back to the country part for underscore locales (de_CH → ch)', () => {
    expect(getFlagUrlForIsoCode('de_CH')).toBe(`${base}/ch.svg`);
    expect(getFlagUrlForIsoCode('zh_CN')).toBe(`${base}/cn.svg`);
  });

  it('returns the language code directly when no override or country part', () => {
    expect(getFlagUrlForIsoCode('de')).toBe(`${base}/de.svg`);
    expect(getFlagUrlForIsoCode('fr')).toBe(`${base}/fr.svg`);
    expect(getFlagUrlForIsoCode('it')).toBe(`${base}/it.svg`);
  });

  it('lowercases the country portion of an underscore locale', () => {
    expect(getFlagUrlForIsoCode('de_ch')).toBe(`${base}/ch.svg`);
    expect(getFlagUrlForIsoCode('DE_CH')).toBe(`${base}/ch.svg`);
  });

  it('exposes a complete and consistent override map', () => {
    // Every override value must be a 2-letter country code (sanity check
    // for future additions — a typo here breaks flag rendering silently).
    Object.values(LANG_TO_COUNTRY_OVERRIDES).forEach((code) => {
      expect(code).toMatch(/^[a-z]{2}$/);
    });
  });
});
