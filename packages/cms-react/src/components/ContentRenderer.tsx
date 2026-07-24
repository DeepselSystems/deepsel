import React, { useEffect, useRef } from 'react';
import { useWebsiteData } from '../contexts/index.js';
import { containsYouTubeJumpMarks, initializeYouTubeJumpMarks } from '../utils/youtubeJumpMarks.js';

/**
 * Renders a page/post's saved rich-text HTML (Preview panel and live site).
 * After the HTML is injected, runs post-render initializers for embedded
 * widgets that rely on global click handlers baked into the HTML by the
 * editor (currently: YouTube jump marks) — those handlers are only ever
 * registered by the editor itself, so static HTML needs them re-registered
 * here to stay interactive.
 */
export function ContentRenderer() {
  const { websiteData } = useWebsiteData();
  const containerRef = useRef<HTMLElement | null>(null);

  const mainContent =
    websiteData?.data &&
    'content' in websiteData.data &&
    typeof websiteData.data.content === 'string'
      ? websiteData.data.content
      : '';

  useEffect(() => {
    if (containerRef.current && containsYouTubeJumpMarks(mainContent)) {
      initializeYouTubeJumpMarks(containerRef.current);
    }
  }, [mainContent]);

  if (!mainContent) {
    return null;
  }

  return (
    <article
      ref={containerRef}
      className="flex-1 pt-10 px-4 xl:px-2 min-w-0"
      dangerouslySetInnerHTML={{ __html: mainContent }}
    />
  );
}
