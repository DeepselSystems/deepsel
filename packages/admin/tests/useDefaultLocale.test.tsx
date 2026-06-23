import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useDefaultLocale } from '../src/common/hooks/useDefaultLocale';
import SitePublicSettingsState from '../src/common/stores/SitePublicSettingsState';

const reset = () => SitePublicSettingsState.setState({ settings: null });

describe('useDefaultLocale', () => {
  afterEach(reset);

  it('returns null/[] when SitePublicSettingsState is empty', () => {
    reset();
    const { result } = renderHook(() => useDefaultLocale());
    expect(result.current.defaultLocaleId).toBeNull();
    expect(result.current.defaultLocale).toBeNull();
    expect(result.current.availableLanguages).toEqual([]);
  });

  it('returns id from default_language object when present', () => {
    SitePublicSettingsState.setState({
      settings: { default_language: { id: 7, iso_code: 'fr' }, available_languages: [] },
    });
    const { result } = renderHook(() => useDefaultLocale());
    expect(result.current.defaultLocaleId).toBe(7);
    expect(result.current.defaultLocale).toEqual({ id: 7, iso_code: 'fr' });
  });

  it('falls back to settings.default_language_id when default_language object is absent', () => {
    SitePublicSettingsState.setState({
      settings: { default_language: null, default_language_id: 42, available_languages: [] },
    });
    const { result } = renderHook(() => useDefaultLocale());
    expect(result.current.defaultLocaleId).toBe(42);
    expect(result.current.defaultLocale).toBeNull();
  });

  it('exposes available_languages from settings', () => {
    const languages = [
      { id: 1, iso_code: 'en' },
      { id: 2, iso_code: 'de' },
    ];
    SitePublicSettingsState.setState({
      settings: { default_language: { id: 1, iso_code: 'en' }, available_languages: languages },
    });
    const { result } = renderHook(() => useDefaultLocale());
    expect(result.current.availableLanguages).toBe(languages);
  });

  it('reactively updates when SitePublicSettingsState changes', () => {
    reset();
    const { result } = renderHook(() => useDefaultLocale());
    expect(result.current.defaultLocaleId).toBeNull();

    act(() =>
      SitePublicSettingsState.setState({
        settings: { default_language: { id: 1, iso_code: 'en' }, available_languages: [] },
      }),
    );
    expect(result.current.defaultLocaleId).toBe(1);
  });
});
