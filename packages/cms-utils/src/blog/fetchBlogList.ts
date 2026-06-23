import type { BlogListData } from './types.js';
import type { Pagination } from '../page/getPathType.js';
import { getDefaultBackendHost } from '../common/utils/getDefaultBackendHost.js';
import { getHostname } from '../common/utils/getHostname.js';

interface FetchBlogListProps {
  lang?: string;
  pagination?: Pagination;
  astroRequest?: Request;
  authToken?: string;
  backendHost?: string;
}

/**
 * Fetches blog list from the backend by language
 * Corresponds to GET /blog_post/website/{lang}
 */
export async function fetchBlogList({
  astroRequest,
  pagination,
  authToken,
  lang = 'default',
  backendHost = getDefaultBackendHost(),
}: FetchBlogListProps): Promise<BlogListData> {
  try {
    let url = `${backendHost}/api/v1/blog_post/list/${lang}`;

    if (pagination) {
      const searchParams = new URLSearchParams();
      if (pagination.page) searchParams.append('page', pagination.page.toString());
      if (pagination.pageSize) searchParams.append('page_size', pagination.pageSize.toString());
      url += `?${searchParams.toString()}`;
    }

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

    if (!response.ok) {
      throw new Error(`Failed to fetch blog list: ${response.statusText}`);
    }

    const jsonData: BlogListData = await response.json();
    return jsonData;
  } catch (error: any) {
    console.error('Error fetching blog list:', error);
    throw error;
  }
}
