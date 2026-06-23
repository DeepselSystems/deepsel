/**
 * API utilities for frontend requests
 */

/**
 * Create headers with hostname for proper domain detection on backend
 * @param {Object} additionalHeaders - Additional headers to merge
 * @returns {Object} Headers object with hostname information
 */
export function createApiHeaders(additionalHeaders = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...additionalHeaders,
  };

  // Add hostname for proper domain detection on backend
  if (typeof window !== 'undefined') {
    headers['X-Frontend-Host'] = window.location.hostname;

    const organizationId = parseInt(localStorage.getItem('organizationId'), 10);
    if (Number.isFinite(organizationId)) {
      headers['X-Organization-Id'] = organizationId.toString();
    }
  }

  return headers;
}

/**
 * Make an API request with proper domain detection headers
 * @param {string} url - API endpoint URL
 * @param {Object} options - Fetch options
 * @returns {Promise<Response>} Fetch response
 */
export async function apiRequest(url, options = {}) {
  const headers = createApiHeaders(options.headers || {});

  return fetch(url, {
    ...options,
    headers,
  });
}
