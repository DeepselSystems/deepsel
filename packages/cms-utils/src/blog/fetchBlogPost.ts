import type { BlogPostData } from './types.js';
import { fetchPublicSettings } from '../page/index.js';
import type { SiteSettings } from '../types.js';
import { getDefaultBackendHost } from '../common/utils/getDefaultBackendHost.js';
import { getHostname } from '../common/utils/getHostname.js';

interface FetchBlogPostProps {
  path: string;
  lang?: string;
  astroRequest?: Request;
  authToken?: string;
  backendHost?: string;
}

/**
 * Fetches a single blog post from the backend by language and path
 * Corresponds to GET /blog_post/website/{lang}/{path}
 */
export async function fetchBlogPost({
  path,
  lang = 'default',
  astroRequest,
  authToken,
  backendHost = getDefaultBackendHost(),
}: FetchBlogPostProps): Promise<BlogPostData> {
  try {
    const cleanPath = path.startsWith('/') ? path.substring(1) : path;
    let postSlug = cleanPath;
    // rm the blog/ prefix
    if (cleanPath.startsWith('blog/')) {
      postSlug = cleanPath.substring('blog/'.length);
    }

    const url = `${backendHost}/api/v1/blog_post/single/${lang}/${postSlug}`;
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

    // Forward cookies for session-based authentication, same as fetchPageData —
    // without this, require_login posts would always appear logged-out.
    if (astroRequest) {
      const cookieHeader = astroRequest.headers.get('cookie');
      if (cookieHeader) {
        fetchOptions.headers['Cookie'] = cookieHeader;
      }
    }

    if (authToken) {
      fetchOptions.headers['Authorization'] = `Bearer ${authToken}`;
    }

    const response = await fetch(url, fetchOptions);

    // Post requires login and no session was present. Return a flag instead of
    // throwing so the caller can render a clear message instead of crashing SSR.
    if (response.status === 401) {
      console.warn('401', url);

      try {
        const siteSettings: SiteSettings = await fetchPublicSettings(
          null,
          astroRequest,
          lang === 'default' ? null : lang,
          backendHost,
        );
        return {
          requiresLogin: true,
          public_settings: siteSettings,
        };
      } catch (settingsError) {
        console.warn('Could not fetch site settings for login-required post:', settingsError);
        throw new Error('Authentication required');
      }
    }

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
      };
    }

    const jsonData: BlogPostData = await response.json();
    return jsonData;
  } catch (error: any) {
    console.error('Error fetching blog post:', error);
    throw error;
  }
}
