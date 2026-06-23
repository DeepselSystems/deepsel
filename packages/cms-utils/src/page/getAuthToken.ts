/**
 * Extracts the authentication token from cookies or URL parameter (for iframe preview)
 */
export function getAuthToken(astro: any): string | null {
  let authToken = null;
  const cookies = astro.request.headers.get('cookie');
  if (cookies) {
    // Try different possible token cookie names
    const tokenMatch = cookies.match(/(?:token|authToken|access_token|jwt)=([^;]+)/);
    authToken = tokenMatch ? tokenMatch[1] : null;
  }

  // If no token from cookies, try URL parameter (for iframe preview)
  if (!authToken) {
    authToken = astro.url.searchParams.get('token');
  }

  return authToken;
}
