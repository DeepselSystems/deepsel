import type { FormData } from './types.js';
import { fetchPublicSettings } from '../page/index.js';
import type { SiteSettings } from '../types.js';
import { getDefaultBackendHost, getHostname } from '../common/utils/index.js';

interface FetchFormDataProps {
  path: string;
  lang?: string;
  astroRequest?: Request;
  authToken?: string;
  backendHost?: string;
}

/**
 * Fetches a public form by language and slug path.
 * Corresponds to GET /api/v1/form/website/{lang}/{slug}
 * Public — no auth token required.
 */
export async function fetchFormData({
  path,
  lang = 'default',
  astroRequest,
  authToken,
  backendHost = getDefaultBackendHost(),
}: FetchFormDataProps): Promise<FormData> {
  try {
    const cleanPath = path.startsWith('/') ? path.substring(1) : path;
    // Strip the leading "forms/" segment from the URL path
    const formSlug = cleanPath.startsWith('forms/')
      ? cleanPath.substring('forms/'.length)
      : cleanPath;

    const url = `${backendHost}/api/v1/form/website/${lang}/${formSlug}`;
    const fetchOptions = {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      } as Record<string, string>,
    };

    const hostname = getHostname(astroRequest);
    if (hostname) {
      fetchOptions.headers['X-Original-Host'] = hostname;
      fetchOptions.headers['X-Frontend-Host'] = hostname;
    }

    if (authToken) {
      fetchOptions.headers['Authorization'] = `Bearer ${authToken}`;
    }

    const response = await fetch(url, fetchOptions);

    if (response.status === 404) {
      try {
        const { detail } = (await response.json()) as { detail?: string };
        console.warn('404', url, { detail });
      } catch {
        console.warn('404', url);
      }

      const siteSettings: SiteSettings = await fetchPublicSettings(
        null,
        astroRequest,
        lang === 'default' ? null : lang,
        backendHost,
      );

      return {
        notFound: true,
        public_settings: siteSettings,
      } as FormData;
    }

    return await response.json();
  } catch (error: unknown) {
    console.error('Error fetching form data:', error);
    throw error;
  }
}
