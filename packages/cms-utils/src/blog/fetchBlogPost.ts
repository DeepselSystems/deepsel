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

    if (authToken) {
      fetchOptions.headers['Authorization'] = `Bearer ${authToken}`;
    }

    const response = await fetch(url, fetchOptions);

    if (response.status === 401) {
      throw new Error('Authentication required');
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
