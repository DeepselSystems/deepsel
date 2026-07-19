import { fetchPublicSettings } from './fetchPublicSettings.js';
import type { PageData } from './types.js';
import type { SiteSettings } from '../types.js';
import { getDefaultBackendHost } from '../common/utils/index.js';
import { getHostname } from '../common/utils/index.js';

interface FetchPageDataProps {
  path: string;
  lang?: string;
  astroRequest?: Request;
  authToken?: string;
  backendHost?: string;
}

/**
 * Fetches page data from the backend by language and slug
 */
export async function fetchPageData({
  path,
  lang,
  astroRequest,
  authToken,
  backendHost = getDefaultBackendHost(),
}: FetchPageDataProps): Promise<PageData> {
  try {
    // Format the path properly, make sure it starts with a slash
    let formattedPath = path.startsWith('/') ? path : `/${path}`;
    // Backend will consider 'default' as the home slug
    if (formattedPath === '/') {
      formattedPath = '/default';
    }

    // Determine the URL based on whether a language is provided
    const langPrefix = lang || 'default';
    let url = `${backendHost}/api/v1/page/website/${langPrefix}${formattedPath}`;

    // Forward preview and org_id parameters from the incoming request
    if (astroRequest) {
      const incomingParams = new URL(astroRequest.url).searchParams;
      const queryParams = new URLSearchParams();
      if (incomingParams.get('preview') === 'true') {
        queryParams.set('preview', 'true');
      }
      if (incomingParams.get('org_id')) {
        queryParams.set('org_id', incomingParams.get('org_id')!);
      }
      const qs = queryParams.toString();
      if (qs) {
        url += `?${qs}`;
      }
    }

    // Prepare fetch options
    const fetchOptions = {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      } as Record<string, string>,
    };

    // Send the current hostname to the backend for domain-based org detection
    const hostname = getHostname(astroRequest);
    if (hostname) {
      fetchOptions.headers['X-Original-Host'] = hostname;
      fetchOptions.headers['X-Frontend-Host'] = hostname;
    }

    // Forward cookies for session-based authentication (used to render user-specific
    // template content). Preview access is gated in the backend by org membership.
    if (astroRequest) {
      const cookieHeader = astroRequest.headers.get('cookie');
      if (cookieHeader) {
        fetchOptions.headers['Cookie'] = cookieHeader;
      }
    }

    // Add authentication headers if token exists (for both preview and protected content)
    if (authToken) {
      fetchOptions.headers['Authorization'] = `Bearer ${authToken}`;
    }

    // Fetch the page data from the backend
    const response = await fetch(url, fetchOptions);

    // Page requires login and no session was present. Return a flag instead of
    // throwing so the caller can render a clear message instead of crashing SSR.
    if (response.status === 401) {
      console.warn('401', url);

      try {
        const siteSettings: SiteSettings = await fetchPublicSettings(
          null,
          astroRequest,
          lang,
          backendHost,
        );
        return {
          requiresLogin: true,
          public_settings: siteSettings,
        };
      } catch (settingsError) {
        console.warn('Could not fetch site settings for login-required page:', settingsError);
        throw new Error('Authentication required');
      }
    }

    // Only treat actual 404 as not found
    if (response.status === 404) {
      try {
        const { detail } = await response.json();
        console.warn('404', url, { detail });
      } catch {
        console.warn('404', url);
      }

      // When page is not found, still fetch menus and site settings
      try {
        const siteSettings: SiteSettings = await fetchPublicSettings(
          null,
          astroRequest,
          lang,
          backendHost,
        );
        return {
          notFound: true,
          public_settings: siteSettings,
        };
      } catch (settingsError) {
        console.warn('Could not fetch site settings for 404 page:', settingsError);
        throw new Error(`Page not found`);
      }
    }

    try {
      // Parse the JSON
      const jsonData = await response.json();

      return jsonData;
    } catch (parseError: any) {
      console.error(`Failed to parse response: ${parseError.message}`);
      throw new Error(`Failed to parse response: ${parseError.message}`);
    }
  } catch (error: any) {
    console.error('Error fetching page data:', error);
    throw error;
  }
}
