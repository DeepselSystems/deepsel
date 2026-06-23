/**
 * Extract the hostname from the current request context.
 *
 * Server-side (Astro SSR): reads the Host header (or X-Original-Host / X-Forwarded-Host)
 * from the incoming request. This is necessary because Astro's Node adapter rewrites
 * request.url to localhost:4321, losing the original domain.
 *
 * Client-side: reads window.location.hostname.
 */
export function getHostname(astroRequest?: Request | null): string | null {
  if (astroRequest) {
    // Prefer explicit forwarding headers set by nginx/proxy
    const xOriginalHost = astroRequest.headers.get('x-original-host');
    if (xOriginalHost) {
      return xOriginalHost.split(':')[0];
    }

    const xForwardedHost = astroRequest.headers.get('x-forwarded-host');
    if (xForwardedHost) {
      return xForwardedHost.split(':')[0];
    }

    // Fall back to Host header (set by nginx: proxy_set_header Host $host)
    const host = astroRequest.headers.get('host');
    if (host) {
      return host.split(':')[0];
    }

    // Last resort: parse the URL (may be localhost in production)
    try {
      return new URL(astroRequest.url).hostname;
    } catch {
      return null;
    }
  }

  // Client-side
  if (typeof window !== 'undefined') {
    return window.location.hostname;
  }

  return null;
}
