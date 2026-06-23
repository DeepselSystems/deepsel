import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(async () => ({ value: null })),
  },
}));

import BackendHostURLState from '../src/common/stores/BackendHostURLState.js';
import { fetchPageData, fetchPublicSettings } from '../src/utils/pageUtils.js';

function jsonResponse(body, { status = 200 } = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: vi.fn().mockResolvedValue(body),
  };
}

describe('pageUtils fetchers', () => {
  beforeEach(() => {
    BackendHostURLState.getState().setBackendHost('https://h/api/v1');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('fetchPageData', () => {
    it('builds /page/website/<lang><slug> when lang is provided', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ title: 'About' }));
      vi.stubGlobal('fetch', fetchMock);

      const data = await fetchPageData('en', '/about');
      expect(data).toEqual({ title: 'About' });
      expect(fetchMock.mock.calls[0][0]).toBe('https://h/api/v1/page/website/en/about');
    });

    it('falls back to /default when lang is null or "default"', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
      vi.stubGlobal('fetch', fetchMock);

      await fetchPageData(null, '/about');
      expect(fetchMock.mock.calls[0][0]).toBe('https://h/api/v1/page/website/default/about');

      await fetchPageData('default', '/about');
      expect(fetchMock.mock.calls[1][0]).toBe('https://h/api/v1/page/website/default/about');
    });

    it('replaces a root slug with /default', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
      vi.stubGlobal('fetch', fetchMock);

      await fetchPageData('en', '/');
      expect(fetchMock.mock.calls[0][0]).toBe('https://h/api/v1/page/website/en/default');
    });

    it('appends ?preview=true when isPreview', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
      vi.stubGlobal('fetch', fetchMock);

      await fetchPageData('en', '/about', true);
      expect(fetchMock.mock.calls[0][0]).toBe(
        'https://h/api/v1/page/website/en/about?preview=true',
      );
    });

    it('sets X-Original-Host / X-Frontend-Host from astroRequest hostname on server', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
      vi.stubGlobal('fetch', fetchMock);

      await fetchPageData('en', '/about', false, null, {
        url: 'https://sitea.example/whatever',
      });
      const headers = fetchMock.mock.calls[0][1].headers;
      expect(headers['X-Original-Host']).toBe('sitea.example');
      expect(headers['X-Frontend-Host']).toBe('sitea.example');
    });

    it('falls back to window.location.hostname when no astroRequest', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
      vi.stubGlobal('fetch', fetchMock);

      await fetchPageData('en', '/about');
      const headers = fetchMock.mock.calls[0][1].headers;
      // happy-dom default location.hostname
      expect(headers['X-Original-Host']).toBe(window.location.hostname);
      expect(headers['X-Frontend-Host']).toBe(window.location.hostname);
    });

    it('adds Authorization when an authToken is provided', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
      vi.stubGlobal('fetch', fetchMock);

      await fetchPageData('en', '/about', false, 'tok-abc');
      expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer tok-abc');
    });

    it('returns an auth-required marker on 401 (no throw)', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(null, { status: 401 }));
      vi.stubGlobal('fetch', fetchMock);

      const data = await fetchPageData('en', '/protected');
      expect(data).toEqual({
        error: true,
        status: 401,
        message: 'Authentication required',
      });
    });

    it('on 404, fetches public settings and returns the notFound envelope', async () => {
      const fetchMock = vi
        .fn()
        // page fetch — 404
        .mockResolvedValueOnce(jsonResponse({ detail: 'missing' }, { status: 404 }))
        // fallback public settings
        .mockResolvedValueOnce(
          jsonResponse({ default_language: { iso_code: 'fr' }, brand: 'demo' }),
        );
      vi.stubGlobal('fetch', fetchMock);

      const data = await fetchPageData(null, '/ghost');
      expect(data).toEqual({
        notFound: true,
        status: 404,
        detail: 'missing',
        public_settings: { default_language: { iso_code: 'fr' }, brand: 'demo' },
        lang: 'fr',
      });
      expect(fetchMock.mock.calls[1][0]).toContain('/util/public_settings');
    });
  });

  describe('fetchPublicSettings', () => {
    it('uses domain detection (/util/public_settings) when orgId is null and sets hostname headers', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
      vi.stubGlobal('fetch', fetchMock);

      await fetchPublicSettings(null, { url: 'https://site.example/x' });
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://h/api/v1/util/public_settings');
      expect(init.headers['X-Original-Host']).toBe('site.example');
      expect(init.headers['X-Frontend-Host']).toBe('site.example');
    });

    it('hits /util/public_settings/:orgId when an orgId is supplied and skips hostname headers', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
      vi.stubGlobal('fetch', fetchMock);

      await fetchPublicSettings(7);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://h/api/v1/util/public_settings/7');
      expect(init.headers['X-Original-Host']).toBeUndefined();
    });

    it('appends ?lang=<code> when a language is provided', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
      vi.stubGlobal('fetch', fetchMock);

      await fetchPublicSettings(null, null, 'en');
      expect(fetchMock.mock.calls[0][0]).toBe('https://h/api/v1/util/public_settings?lang=en');

      await fetchPublicSettings(7, null, 'fr');
      expect(fetchMock.mock.calls[1][0]).toBe('https://h/api/v1/util/public_settings/7?lang=fr');
    });

    it('returns null on a non-OK response', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, { status: 500 }));
      vi.stubGlobal('fetch', fetchMock);
      const data = await fetchPublicSettings(null);
      expect(data).toBeNull();
    });
  });
});
