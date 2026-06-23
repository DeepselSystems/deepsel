import type { FormStatisticsData } from './types.js';
import { fetchPublicSettings } from '../page/index.js';
import type { SiteSettings } from '../types.js';
import { getDefaultBackendHost, getHostname } from '../common/utils/index.js';

interface FetchFormStatisticsProps {
  path: string;
  lang?: string;
  astroRequest?: Request;
  authToken?: string;
  backendHost?: string;
}

/**
 * Fetches form statistics (submissions + field data) by language and slug path.
 * Corresponds to GET /api/v1/form/website/{lang}/{slug}/statistics
 * Public when enable_public_statistics=true; admins can always access.
 */
export async function fetchFormStatistics({
  path,
  lang = 'default',
  astroRequest,
  authToken,
  backendHost = getDefaultBackendHost(),
}: FetchFormStatisticsProps): Promise<FormStatisticsData> {
  try {
    const cleanPath = path.startsWith('/') ? path.substring(1) : path;
    // Strip leading "forms/" and trailing "/statistics" to get the bare slug
    const withoutPrefix = cleanPath.startsWith('forms/')
      ? cleanPath.substring('forms/'.length)
      : cleanPath;
    const formSlug = withoutPrefix.endsWith('/statistics')
      ? withoutPrefix.slice(0, -'/statistics'.length)
      : withoutPrefix;

    const url = `${backendHost}/api/v1/form/website/${lang}/${formSlug}/statistics`;
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
      const siteSettings: SiteSettings = await fetchPublicSettings(
        null,
        astroRequest,
        lang === 'default' ? null : lang,
        backendHost,
      );
      return {
        notFound: true,
        public_settings: siteSettings,
        submissions: [],
      } as unknown as FormStatisticsData;
    }

    return await response.json();
  } catch (error: unknown) {
    console.error('Error fetching form statistics:', error);
    throw error;
  }
}
