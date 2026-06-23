import { WebsiteDataTypes, type WebsiteDataType } from '../constants/index.js';

export interface Pagination {
  page?: number;
  pageSize?: number;
}

export function getPathType(path: string): { pathType: WebsiteDataType; pagination?: Pagination } {
  let pathType: WebsiteDataType = WebsiteDataTypes.Page;
  let pagination: Pagination | undefined = undefined;

  // delete forward at the beginning
  if (path.startsWith('/')) {
    path = path.slice(1);
  }

  if (path === '' || path === '/') {
    return { pathType: WebsiteDataTypes.Home };
  }

  if (path === 'search' || path.startsWith('search?') || path.startsWith('search/')) {
    return { pathType: WebsiteDataTypes.SearchResults };
  }

  if (path.startsWith('forms/') || path === 'forms') {
    if (path.endsWith('/statistics')) {
      return { pathType: WebsiteDataTypes.FormStatistics };
    }
    return { pathType: WebsiteDataTypes.Form };
  }

  if (path.startsWith('blog')) {
    // split
    const parts = path.split('/');
    let pageSize: number | undefined = undefined;
    // extract query parameters if any
    const queryString = path.split('?')[1];
    if (queryString) {
      const params = new URLSearchParams(queryString);
      const size = params.get('pageSize');
      if (size && !isNaN(Number(size))) {
        pageSize = Number(size);
      }
    }

    // check which blog list format, either /blog, /blog/page/2, or /blog/{slug}
    if (parts.length > 1 && parts[1] !== '') {
      // /blog/page/2
      if (parts[1] === 'page' && parts[2] && !isNaN(Number(parts[2]))) {
        pathType = WebsiteDataTypes.BlogList;
        pagination = { page: Number(parts[2]), pageSize };
      }
      // /blog/{slug}
      else {
        pathType = WebsiteDataTypes.BlogPost;
      }
    } else {
      // /blog
      pathType = WebsiteDataTypes.BlogList;
      if (pageSize) {
        pagination = { pageSize };
      }
    }
  }

  return { pathType, pagination };
}
