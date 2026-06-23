import BackendHostURLState from '../common/stores/BackendHostURLState.js';
import { isValidLanguage } from '../constants/locales';

/**
 * Parses a slug to determine language and path
 * @param {string|null} slug - The slug from URL params
 * @returns {Object} - Object containing lang and path
 */
export function parseSlugForLangAndPath(slug) {
  // console.log('parseSlugForLangAndPath', slug);
  // Parse the slug to determine language and path
  const slugParts = slug ? slug.split('/').filter(Boolean) : [];
  let lang = null;
  let path = '/';

  // Check if the first part is a valid language code
  if (slugParts.length > 0 && isValidLanguage(slugParts[0])) {
    lang = slugParts[0];
    // If there are more parts, join them as the path, otherwise keep root path
    if (slugParts.length > 1) {
      path = '/' + slugParts.slice(1).join('/');
    }
  } else {
    // No language in URL, use the path as is with a leading slash
    path = slugParts.length > 0 ? '/' + slugParts.join('/') : '/';
  }

  return { lang, path };
}

/**
 * Fetches page data from the backend by language and slug
 * Handles both regular pages and blog routes (starting with /blog)
 *
 * @param {string|null} lang - The language code, null for default language
 * @param {string} slug - The page slug (e.g., "/about", "/blog", "/blog/my-post")
 * @param {boolean} isPreview - Whether this is a preview request (allows unpublished pages)
 * @param {string|null} authToken - Optional auth token for server-side requests
 * @param {Request|null} astroRequest - Optional Astro request object for server-side domain detection
 * @returns {Promise<Object>} - The page data (includes blog_posts array for /blog list, or blog post fields for single posts)
 */
export async function fetchPageData(
  lang,
  slug,
  isPreview = false,
  authToken = null,
  astroRequest = null,
) {
  try {
    // Format the slug properly
    let formattedSlug = slug.startsWith('/') ? slug : `/${slug}`;
    if (formattedSlug === '/') {
      formattedSlug = '/default';
    }

    // Determine the URL based on whether a language is provided
    const backendHost = BackendHostURLState.getState().backendHost;
    let url;
    if (lang && lang !== 'default') {
      url = `${backendHost}/page/website/${lang}${formattedSlug}`;
    } else {
      url = `${backendHost}/page/website/default${formattedSlug}`;
    }

    // Add preview parameter if enabled
    if (isPreview) {
      url += '?preview=true';
    }

    // Prepare fetch options
    const fetchOptions = {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    };

    // Send the current hostname to the backend for proper domain detection
    let hostname = null;

    // Server-side: Extract hostname from Astro request
    if (astroRequest) {
      const url = new URL(astroRequest.url);
      hostname = url.hostname;
    }
    // Client-side: Extract hostname from window
    else if (typeof window !== 'undefined') {
      hostname = window.location.hostname;
    }

    if (hostname) {
      fetchOptions.headers['X-Original-Host'] = hostname;
      fetchOptions.headers['X-Frontend-Host'] = hostname;
      // Note: Cannot override Host header due to browser security restrictions
    }

    // Add authentication headers if token exists (for both preview and protected content)
    let token = authToken;

    // If no token provided and we're in browser environment, try Capacitor Preferences
    if (!token && typeof window !== 'undefined') {
      try {
        const { Preferences } = await import('@capacitor/preferences');
        const tokenResult = await Preferences.get({ key: 'token' });
        token = tokenResult.value;
      } catch (e) {
        console.warn('Could not get token from Preferences:', e);
      }
    }

    if (token) {
      fetchOptions.headers['Authorization'] = `Bearer ${token}`;
    }

    // Fetch the page data from the backend
    const response = await fetch(url, fetchOptions);

    // Handle authentication errors
    if (response.status === 401) {
      return { error: true, status: 401, message: 'Authentication required' };
    }

    // Only treat actual 404 as not found
    if (response.status === 404) {
      const { detail } = await response.json();
      console.log('404', url, { detail });

      // When page is not found, still fetch menus and site settings
      try {
        const siteSettings = await fetchPublicSettings(null, astroRequest, lang);
        return {
          notFound: true,
          status: 404,
          detail,
          public_settings: siteSettings,
          lang: lang || siteSettings?.default_language?.iso_code || 'en',
        };
      } catch (settingsError) {
        console.warn('Could not fetch site settings for 404 page:', settingsError);
        return { notFound: true, status: 404, detail };
      }
    }

    try {
      // Parse the JSON
      const jsonData = await response.json();

      return jsonData;
    } catch (parseError) {
      console.error(`Failed to parse response: ${parseError.message}`);
      return { error: true, parseError: parseError.message };
    }
  } catch (error) {
    console.error('Error fetching page data:', error);
    return { error: true, message: error.message };
  }
}

/**
 * Fetches Form data from the backend by language and slug
 * @param {string} lang
 * @param {string} slug
 * @param {string?} authToken
 */
export async function fetchFormData(lang, slug, authToken) {
  try {
    // Format the slug properly
    const formattedSlug = slug.replace(/^\/forms\//, '');

    // Determine the URL based on whether a language is provided
    const backendHost = BackendHostURLState.getState().backendHost;
    const url = `${backendHost}/form/website/${lang}/${formattedSlug}`;

    // Prepare fetch options
    const fetchOptions = {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    };

    // Add authentication headers if token exists (for both preview and protected content)
    let token = authToken;

    // If no token provided, and we're in browser environment, try Capacitor Preferences
    if (!token && typeof window !== 'undefined') {
      try {
        const { Preferences } = await import('@capacitor/preferences');
        const tokenResult = await Preferences.get({ key: 'token' });
        token = tokenResult.value;
      } catch (e) {
        console.warn('Could not get token from Preferences:', e);
      }
    }

    if (token) {
      fetchOptions.headers['Authorization'] = `Bearer ${token}`;
    }

    // Fetch the page data from the backend
    const response = await fetch(url, fetchOptions);

    // Only treat actual 404 as not found
    if (response.status === 404) {
      const { detail } = await response.json();
      console.warn('404', url, { detail });
      return { notFound: true, status: 404, detail };
    }

    try {
      // Parse the JSON
      return await response.json();
    } catch (parseError) {
      console.error(`Failed to parse response: ${parseError.message}`);
      return { error: true, parseError: parseError.message };
    }
  } catch (error) {
    console.error('Error fetching page data:', error);
    return { error: true, message: error.message };
  }
}

/**
 * Fetches public settings from the backend
 * @param {number|null} orgId - The organization ID (if null, uses domain detection)
 * @param {Request|null} astroRequest - Optional Astro request object for server-side domain detection
 * @param {string|null} lang - Optional language parameter
 * @returns {Promise<Object>} - The public settings data
 */
export async function fetchPublicSettings(orgId = null, astroRequest = null, lang = null) {
  try {
    const backendHost = BackendHostURLState.getState().backendHost;
    let url;

    if (orgId === null) {
      // Use domain-based detection when orgId is null
      url = `${backendHost}/util/public_settings`;
      if (lang) {
        url += `?lang=${encodeURIComponent(lang)}`;
      }
    } else {
      // Handle server-side environment where localStorage is not available
      let organizationId = orgId;

      // Only access localStorage if we're in a browser environment and orgId not provided
      if (typeof window !== 'undefined' && window.localStorage && !orgId) {
        organizationId = parseInt(localStorage.getItem('organizationId')) || 1;
      }

      url = `${backendHost}/util/public_settings/${organizationId}`;
      if (lang) {
        url += `?lang=${encodeURIComponent(lang)}`;
      }
    }

    // Detect current hostname for domain-based organization detection
    const headers = {
      'Content-Type': 'application/json',
    };

    // For domain-based detection, send the current hostname to the backend
    if (orgId === null) {
      let hostname = null;

      // Server-side: Extract hostname from Astro request
      if (astroRequest) {
        const url = new URL(astroRequest.url);
        hostname = url.hostname;
      }
      // Client-side: Extract hostname from window
      else if (typeof window !== 'undefined') {
        hostname = window.location.hostname;
      }

      if (hostname) {
        headers['X-Original-Host'] = hostname;
        headers['X-Frontend-Host'] = hostname;
        // Note: Cannot override Host header due to browser security restrictions
      }
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: headers,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching public settings:', error);
    return null;
  }
}
