import { fetchPublicSettings } from './fetchPublicSettings.js';
import type { SiteSettings } from '../types.js';
import { getDefaultBackendHost } from '../common/utils/getDefaultBackendHost.js';
import { getHostname } from '../common/utils/getHostname.js';

export interface SearchResultItem {
  id: string;
  title: string;
  url: string;
  publishDate: string | null;
  contentType: string; // "Page" or "Blog"
  relevanceScore: number;
}

export interface SearchResultsData {
  lang: string;
  query: string;
  public_settings: SiteSettings;
  results: SearchResultItem[];
  total: number;
  suggestions: string[];
}

interface FetchSearchResultsProps {
  lang?: string;
  q: string;
  limit?: number;
  astroRequest?: Request;
  authToken?: string;
  backendHost?: string;
}

/**
 * Fetches search results from the backend.
 * Calls GET /api/v1/page/website_search/{lang}?q=...&limit=...
 */
export async function fetchSearchResults({
  lang = 'default',
  q,
  limit = 100,
  astroRequest,
  authToken,
  backendHost = getDefaultBackendHost(),
}: FetchSearchResultsProps): Promise<SearchResultsData> {
  // Build hostname for headers
  const hostname = getHostname(astroRequest);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (hostname) {
    headers['X-Original-Host'] = hostname;
    headers['X-Frontend-Host'] = hostname;
  }
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  // Always fetch public_settings alongside the search call
  const settingsPromise = fetchPublicSettings(null, astroRequest ?? null, lang, backendHost);

  // If no query, skip the search call and return empty results
  if (!q.trim()) {
    const public_settings = await settingsPromise;
    // Normalize lang: replace 'default' with the actual ISO code from settings
    const resolvedLang =
      lang === 'default' ? public_settings.default_language?.iso_code || lang : lang;
    return {
      lang: resolvedLang,
      query: q,
      public_settings,
      results: [],
      total: 0,
      suggestions: [],
    };
  }

  const searchParams = new URLSearchParams({ q, limit: String(limit) });
  const searchUrl = `${backendHost}/api/v1/page/website_search/${lang}?${searchParams.toString()}`;

  const [public_settings, searchResponse] = await Promise.allSettled([
    settingsPromise,
    fetch(searchUrl, { method: 'GET', headers }),
  ]);

  const resolvedSettings =
    public_settings.status === 'fulfilled' ? public_settings.value : ({} as SiteSettings);

  // Normalize lang: replace 'default' with the actual ISO code from settings
  const resolvedLang =
    lang === 'default' ? resolvedSettings.default_language?.iso_code || lang : lang;

  if (searchResponse.status === 'rejected' || !searchResponse.value.ok) {
    console.error(
      'Error fetching search results:',
      searchResponse.status === 'rejected'
        ? searchResponse.reason
        : searchResponse.value.statusText,
    );
    return {
      lang: resolvedLang,
      query: q,
      public_settings: resolvedSettings,
      results: [],
      total: 0,
      suggestions: [],
    };
  }

  const apiData = await searchResponse.value.json();

  return {
    lang: resolvedLang,
    query: q,
    public_settings: resolvedSettings,
    results: apiData.results ?? [],
    total: apiData.total ?? 0,
    suggestions: apiData.suggestions ?? [],
  };
}
