interface PageTransitionProps {
  onPathChange?: (path: string) => void;
  onNavigate?: (url: string, event: MouseEvent) => void;
}

/**
 * @deprecated This component is no longer used by WebsiteDataProvider.
 * Astro SSR handles routing and SEO metadata natively.
 */
export function PageTransition({ onPathChange, onNavigate }: PageTransitionProps) {
  // All functionality has been deprecated:
  // - SEO metadata sync (title, description, robots, lang) — handled by Astro SSR
  // - History/URL change listener + data re-fetch — unnecessary with full-page navigation
  // - Link click interception for SPA navigation — unnecessary with Astro routing

  return null;
}
