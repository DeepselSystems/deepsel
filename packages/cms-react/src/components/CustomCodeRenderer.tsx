import React, { useEffect, useRef } from 'react';
import { useWebsiteData } from '../contexts/index.js';

/** Content types supported by CustomCodeRenderer */
export type CustomCodeContentType = 'page' | 'blog_post' | 'blog_list' | 'search_result' | 'form';

export interface CustomCodeRendererProps {
  /** Page, blog post or form data object */
  pageData?: Record<string, unknown> | null;
  /** Language-specific content data */
  contentData?: Record<string, unknown> | null;
  /** Type of content being rendered */
  type: CustomCodeContentType;
  /** Whether the page is in preview mode — custom code is disabled for security */
  isPreviewMode?: boolean;
}

/**
 * Renders custom HTML/JS code blocks in the correct priority order:
 * language-specific → all-language → site-wide.
 * Skips all execution in preview mode for security.
 */
export function CustomCodeRenderer({
  pageData,
  contentData,
  type,
  isPreviewMode = false,
}: CustomCodeRendererProps) {
  const { websiteData } = useWebsiteData();

  /**
   * pageData/contentData are frozen at initial hydration (passed once as island
   * props). On the live site, switching language via the header selector is a
   * client-side navigation that only updates the WebsiteDataProvider context
   * (see PageTransition), not these props — so for 'page' type, per-language and
   * page-level code must be sourced from context to follow the displayed language.
   */
  const pageContext =
    type === 'page'
      ? (websiteData.data as unknown as Record<string, unknown> | undefined)
      : undefined;

  /**
   * Must be computed before hooks — codeKey (used in useEffect deps) is derived from this list.
   * Computing it here (not after hooks) avoids the React rules-of-hooks ordering constraint.
   */
  const codesToRender: { code: string; source: string }[] = [];

  // 1. Language-specific custom code — not for blog list or search result
  const languageSpecificCode = pageContext ? pageContext.custom_code : contentData?.custom_code;
  if (type !== 'blog_list' && type !== 'search_result' && languageSpecificCode) {
    codesToRender.push({
      code: languageSpecificCode as string,
      source: 'language_specific',
    });
  }

  // 2. All-language custom code per content type
  if (type === 'page' && pageContext?.page_custom_code) {
    codesToRender.push({
      code: pageContext.page_custom_code as string,
      source: 'page_all_langs',
    });
  } else if (type === 'blog_post' && pageData?.blog_post_custom_code) {
    codesToRender.push({
      code: pageData.blog_post_custom_code as string,
      source: 'blog_post_all_langs',
    });
  } else if (type === 'form' && pageData?.form_custom_code) {
    codesToRender.push({
      code: pageData.form_custom_code as string,
      source: 'form_all_langs',
    });
  }

  // 3. Site-wide custom code from public settings
  if (websiteData.settings?.website_custom_code) {
    codesToRender.push({
      code: websiteData.settings.website_custom_code,
      source: 'website',
    });
  }

  /**
   * Stable string fingerprint of all code blocks.
   * Using object references (pageData, contentData, websiteData.settings) as useEffect deps
   * caused scripts to re-execute on every parent re-render because inline objects like
   * `pageData={{ form_custom_code: ... }}` create a new reference each time.
   * This string key only changes when the actual code content changes — preventing double execution.
   */
  const codeKey = codesToRender.map(({ source, code }) => `${source}:${code}`).join('||');

  const containerRef = useRef<HTMLDivElement>(null);

  /**
   * Re-runs only when isPreviewMode or codeKey changes.
   * codeKey is stable across parent re-renders as long as code content doesn't change,
   * so scripts execute exactly once on mount and again only if the code itself is updated.
   *
   * Scripts injected via dangerouslySetInnerHTML are inert — browsers don't execute them.
   * We must clone each into a new <script> element and replace the original to trigger execution.
   */
  useEffect(() => {
    if (isPreviewMode || !containerRef.current) return;

    const container = containerRef.current;
    const scripts = container.getElementsByTagName('script');
    Array.from(scripts).forEach((script, index) => {
      setTimeout(() => {
        try {
          const newScript = document.createElement('script');
          Array.from(script.attributes).forEach((attr) => {
            newScript.setAttribute(attr.name, attr.value);
          });

          if (script.src) {
            newScript.src = script.src;
            newScript.async = true;
          } else {
            newScript.innerHTML = script.innerHTML;
          }

          newScript.onerror = (error) => {
            console.warn('Custom code script error:', error);
          };

          script.parentNode?.replaceChild(newScript, script);
        } catch (scriptError) {
          console.warn('Error executing custom code script:', scriptError);
        }
      }, index * 10);
    });
  }, [isPreviewMode, codeKey]);

  if (isPreviewMode || codesToRender.length === 0) {
    return null;
  }

  return (
    <div ref={containerRef} className="custom-code-content">
      {codesToRender.map(({ code, source }, index) => {
        if (!code || !code.trim()) return null;

        return (
          <div
            key={`${source}-${index}`}
            data-custom-code-source={source}
            data-custom-code-index={index}
            dangerouslySetInnerHTML={{ __html: code }}
          />
        );
      })}
    </div>
  );
}
