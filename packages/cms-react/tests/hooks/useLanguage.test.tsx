import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLanguage } from '../../src/hooks/useLanguage';
import { WebsiteDataProvider } from '../../src/contexts/WebsiteDataContext';
import type { PageData } from '@deepsel/cms-utils';
import React from 'react';

// Mock cms-utils — spread actual module so constants like FORM_FIELD_TYPE remain available
vi.mock('@deepsel/cms-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@deepsel/cms-utils')>();
  return {
    ...actual,
    parseSlug: vi.fn((pathname: string) => {
      const parts = pathname.split('/').filter(Boolean);
      if (parts.length > 0 && parts[0].length === 2) {
        return { lang: parts[0], path: '/' + parts.slice(1).join('/'), pathType: 'Page' };
      }
      return { lang: undefined, path: pathname, pathType: 'Page' };
    }),
    fetchPageData: vi.fn(() => Promise.resolve({ notFound: false })),
    fetchBlogList: vi.fn(() => Promise.resolve({})),
    fetchBlogPost: vi.fn(() => Promise.resolve({ notFound: false })),
  };
});

describe('useLanguage', () => {
  const mockPageData: PageData = {
    id: '1',
    title: 'Test Page',
    slug: '/test',
    lang: 'en',
    public_settings: {
      default_language: {
        id: '1',
        name: 'English',
        iso_code: 'en',
      },
      available_languages: [
        { id: '1', name: 'English', iso_code: 'en', code: 'en' },
        { id: '2', name: 'German', iso_code: 'de', code: 'de' },
        { id: '3', name: 'French', iso_code: 'fr', code: 'fr' },
      ],
    },
    language_alternatives: [
      { locale: { iso_code: 'en' }, slug: '/test' },
      { locale: { iso_code: 'de' }, slug: '/test-de' },
      { locale: { iso_code: 'fr' }, slug: '/test-fr' },
    ],
  } as any;

  let pushStateSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    pushStateSpy = vi.spyOn(window.history, 'pushState').mockImplementation(() => {});
  });

  afterEach(() => {
    pushStateSpy?.mockRestore();
  });

  it('should return current language from pageData', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <WebsiteDataProvider websiteData={{ type: 'Page', data: mockPageData }}>
        {children}
      </WebsiteDataProvider>
    );

    const { result } = renderHook(() => useLanguage(), { wrapper });

    expect(result.current.language).toBe('en');
  });

  it('should return default language when pageData.lang is not set', () => {
    const pageDataWithoutLang = { ...mockPageData, lang: undefined };
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <WebsiteDataProvider websiteData={{ type: 'Page', data: pageDataWithoutLang }}>
        {children}
      </WebsiteDataProvider>
    );

    const { result } = renderHook(() => useLanguage(), { wrapper });

    expect(result.current.language).toBe('en');
  });

  it('should return available languages', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <WebsiteDataProvider websiteData={{ type: 'Page', data: mockPageData }}>
        {children}
      </WebsiteDataProvider>
    );

    const { result } = renderHook(() => useLanguage(), { wrapper });

    expect(result.current.availableLanguages).toHaveLength(3);
    expect(result.current.availableLanguages[0].iso_code).toBe('en');
  });

  it('should change language using language alternatives', () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/test' },
      writable: true,
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <WebsiteDataProvider websiteData={{ type: 'Page', data: mockPageData }}>
        {children}
      </WebsiteDataProvider>
    );

    const { result } = renderHook(() => useLanguage(), { wrapper });

    act(() => {
      result.current.setLanguage('de');
    });

    expect(pushStateSpy).toHaveBeenCalledWith(null, '', '/de/test-de');
  });

  it('should use default language path without prefix', () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/de/test-de' },
      writable: true,
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <WebsiteDataProvider websiteData={{ type: 'Page', data: mockPageData }}>
        {children}
      </WebsiteDataProvider>
    );

    const { result } = renderHook(() => useLanguage(), { wrapper });

    act(() => {
      result.current.setLanguage('en');
    });

    expect(pushStateSpy).toHaveBeenCalledWith(null, '', '/test');
  });

  it('should fallback to current path if no language alternative found', () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/test' },
      writable: true,
    });

    const pageDataWithoutAlternatives = { ...mockPageData, language_alternatives: [] };
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <WebsiteDataProvider websiteData={{ type: 'Page', data: pageDataWithoutAlternatives }}>
        {children}
      </WebsiteDataProvider>
    );

    const { result } = renderHook(() => useLanguage(), { wrapper });

    act(() => {
      result.current.setLanguage('de');
    });

    expect(pushStateSpy).toHaveBeenCalledWith(null, '', '/de/test');
  });
});
