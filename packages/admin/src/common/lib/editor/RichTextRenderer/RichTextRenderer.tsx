import React, { useEffect, useRef } from 'react';
import {
  containsYouTubeJumpMarks,
  initializeYouTubeJumpMarks,
} from '../RichTextInput/extensions/youtube-jumpmarks-extension/utils';
import {
  containsEnhancedCodeBlocks,
  initializeEnhancedCodeBlocks,
} from '../RichTextInput/extensions/enhanced-code-block-extension/utils';
import {
  containsJinja2InRenderedContent,
  initializeJinja2InRenderedContent,
} from '../RichTextInput/extensions/jinja2-markdown-extension/utils';

export interface RichTextRendererProps {
  /** HTML content to render. */
  content: string;

  /** Additional className applied to the root container div. */
  className?: string;
}

/**
 * A component that safely renders rich text content with nested components
 * while preserving the parent site's styling.
 *
 * Initializes YouTube jump marks, enhanced images, and enhanced code blocks
 * after content is rendered into the DOM.
 */
export function RichTextRenderer({ content, className = '' }: RichTextRendererProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current || !content) return;

    // Set the HTML content
    containerRef.current.innerHTML = content;

    // Process all richtext containers to render their content properly
    processRichTextContainers(containerRef.current);

    // Initialize YouTube jump marks after content is rendered
    const hasYouTubeJumpMarks =
      containerRef.current.innerHTML && containsYouTubeJumpMarks(containerRef.current.innerHTML);

    if (hasYouTubeJumpMarks) {
      initializeYouTubeJumpMarks(containerRef.current);
    }

    // Initialize enhanced code blocks after content is rendered
    const hasEnhancedCodeBlocks = containsEnhancedCodeBlocks(containerRef.current);

    if (hasEnhancedCodeBlocks) {
      initializeEnhancedCodeBlocks(containerRef.current);
    }

    // Initialize Jinja2 syntax highlighting in rendered content
    const hasJinja2 = containsJinja2InRenderedContent(containerRef.current);
    if (hasJinja2) {
      initializeJinja2InRenderedContent(containerRef.current);
    }
  }, [content]);

  return <div ref={containerRef} className={`rich-text-content ${className}`} />;
}

/**
 * Recursively process all richtext containers in the given element,
 * rendering escaped HTML content stored in .richtext-content nodes.
 */
function processRichTextContainers(element: HTMLElement): void {
  const richtextContainers = element.querySelectorAll('.richtext-container');

  richtextContainers.forEach((container) => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    const contentDiv = container.querySelector('.richtext-content') as HTMLElement | null;
    if (contentDiv) {
      const htmlContent =
        contentDiv.textContent || (contentDiv as HTMLElement & { innerText?: string }).innerText;
      if (htmlContent && htmlContent.trim().startsWith('<')) {
        contentDiv.innerHTML = htmlContent;
        processRichTextContainers(contentDiv);
      }
    }
  });
}
