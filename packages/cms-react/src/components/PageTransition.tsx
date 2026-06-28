import { useCallback, useEffect } from 'react';
import { useWebsiteData } from '../contexts/index.js';
import {
  fetchPageData,
  fetchBlogList,
  fetchBlogPost,
  parseSlug,
  WebsiteDataTypes,
  isCrossingTemplateBoundary,
  type PageData,
  BlogListData,
  BlogPostData,
  WebsiteDataType,
} from '@deepsel/cms-utils';

interface PageTransitionProps {
  onPathChange?: (path: string) => void;
  onNavigate?: (url: string, event: MouseEvent) => void;
}

export function PageTransition({ onPathChange, onNavigate }: PageTransitionProps) {
  // Initialize the page data store
  const { websiteData, setWebsiteData } = useWebsiteData();

  // Client-side navigation function
  const navigateToUrl = useCallback(
    async (url: string) => {
      try {
        const { lang, path, pathType } = parseSlug(url);

        if (
          ([WebsiteDataTypes.Home, WebsiteDataTypes.Page] as WebsiteDataType[]).includes(pathType)
        ) {
          const data: PageData = await fetchPageData({ path, lang });

          if (data.notFound) {
            window.location.href = url;
            return;
          }

          window.history.pushState(null, '', url);
          setWebsiteData({
            type: pathType,
            data: data,
          });
        } else if (pathType == WebsiteDataTypes.BlogList) {
          const data: BlogListData = await fetchBlogList({ lang });
          setWebsiteData({
            type: pathType,
            data: data,
          });
        } else if (pathType == WebsiteDataTypes.BlogPost) {
          const data: BlogPostData = await fetchBlogPost({ path, lang });

          if (data.notFound) {
            window.location.href = url;
            return;
          }

          setWebsiteData({
            type: pathType,
            data: data,
          });
        }

        // onPathChange?.(window.location.pathname);
      } catch (error) {
        console.error('Navigation error:', error);
      }
    },
    [setWebsiteData],
  );

  useEffect(() => {
    // Update document title and meta tags when website data changes
    const data = websiteData.data;
    if (data && 'seo_metadata' in data) {
      const seoMetaData = data.seo_metadata;

      // Update title
      if (seoMetaData?.title && typeof seoMetaData?.title === 'string') {
        document.title = seoMetaData.title;
      }

      // Update meta description
      const metaDescription = document.querySelector('meta[name="description"]');
      const metaDescriptionContent = seoMetaData?.description;
      if (metaDescription && typeof metaDescriptionContent === 'string') {
        metaDescription.setAttribute('content', metaDescriptionContent);
      }

      // Update robots meta tag
      const metaRobots = document.querySelector('meta[name="robots"]');
      if (metaRobots && typeof seoMetaData?.allow_indexing === 'boolean') {
        const robotsContent = seoMetaData?.allow_indexing ? 'index, follow' : 'noindex, nofollow';
        metaRobots.setAttribute('content', robotsContent);
      }

      // Update html lang attribute
      if (data.lang) {
        document.documentElement.lang = data.lang;
      }
    }
  }, [websiteData]);

  useEffect(() => {
    // Watch for URL path changes (browser back/forward) and re-fetch data
    const handlePathChange = async () => {
      const currentPath = window.location.pathname;

      const { lang, path, pathType, pagination } = parseSlug(currentPath);

      if (
        ([WebsiteDataTypes.Home, WebsiteDataTypes.Page] as WebsiteDataType[]).includes(pathType)
      ) {
        const data: PageData = await fetchPageData({ path, lang });
        if (data.notFound) {
          window.location.reload();
          return;
        }

        setWebsiteData({
          type: pathType,
          data: data,
        });
      } else if (pathType == WebsiteDataTypes.BlogList) {
        const data: BlogListData = await fetchBlogList({ lang, pagination });
        console.warn({ currentPath, lang, path, pathType, pagination, data });
        setWebsiteData({
          type: pathType,
          data: data,
        });
      } else if (pathType == WebsiteDataTypes.BlogPost) {
        const data: BlogPostData = await fetchBlogPost({ path, lang });

        if (data.notFound) {
          window.location.reload();
          return;
        }

        setWebsiteData({
          type: pathType,
          data: data,
        });
      }

      onPathChange?.(currentPath);
    };

    const handlePathChangeListener = () => {
      void handlePathChange();
    };

    window.addEventListener('popstate', handlePathChangeListener);

    const originalPushState = history.pushState.bind(history);
    const originalReplaceState = history.replaceState.bind(history);

    history.pushState = function (...args) {
      originalPushState(...args);
      void handlePathChange();
    };

    history.replaceState = function (...args) {
      originalReplaceState(...args);
      void handlePathChange();
    };

    return () => {
      window.removeEventListener('popstate', handlePathChangeListener);
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
    };
  }, [setWebsiteData]);

  useEffect(() => {
    // Intercept all <a> tag clicks for client-side navigation
    const handleLinkClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const link = target.closest('a');

      if (!link) return;

      const href = link.getAttribute('href');

      // Skip if no href or it's an external link
      if (
        !href ||
        href.startsWith('http') ||
        href.startsWith('//') ||
        href.startsWith('mailto:') ||
        href.startsWith('tel:')
      ) {
        return;
      }

      // Skip if it has target="_blank" or similar
      if (link.target && link.target !== '_self') {
        return;
      }

      // Skip if it's a hash link on the same page
      if (href.startsWith('#')) {
        return;
      }

      // Skip if modifier keys are pressed (allow opening in new tab)
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
        return;
      }

      // Skip if it has download attribute
      if (link.hasAttribute('download')) {
        return;
      }

      // Skip if crossing template boundary (e.g. from page to blog list)
      if (isCrossingTemplateBoundary(window.location.pathname, href)) {
        return;
      }

      // Skip if current page is a theme-defined client page (static content outside React)
      if (websiteData.data && 'clientPage' in websiteData.data && websiteData.data.clientPage) {
        return;
      }

      // Prevent default navigation and stop propagation
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      // Handle the navigation
      if (onNavigate) {
        onNavigate(href, event);
      } else {
        void navigateToUrl(href);
      }
    };

    // Add click listener to document with capture phase to intercept early
    document.addEventListener('click', handleLinkClick, true);

    return () => {
      document.removeEventListener('click', handleLinkClick, true);
    };
  }, [onNavigate, onPathChange, navigateToUrl]);

  return null;
}
