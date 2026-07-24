/**
 * Constants for YouTube jump marks markup emitted by the TipTap
 * youtube-jumpmarks-extension in @deepsel/admin. Must stay in sync with
 * YOUTUBE_JUMP_MARKS_ATTRIBUTES/YOUTUBE_JUMP_MARKS_CLASSES there.
 */
const YOUTUBE_JUMP_MARKS_CONTAINER_ATTR = 'data-youtube-jump-marks';
const JUMP_MARK_ITEM_CLASS = 'jump-mark-item';

declare global {
  interface Window {
    handleJumpMarkClick?: (element: HTMLElement, videoId: string, time: number) => void;
  }
}

/**
 * Checks whether rendered HTML contains a YouTube jump marks block.
 */
export function containsYouTubeJumpMarks(htmlContent: string): boolean {
  return (
    typeof htmlContent === 'string' &&
    htmlContent.includes(`${YOUTUBE_JUMP_MARKS_CONTAINER_ATTR}="true"`)
  );
}

/**
 * Registers the global `handleJumpMarkClick` function referenced by the
 * inline `onclick` attributes the youtube-jumpmarks-extension bakes into
 * saved page content. The editor injects this handler itself while mounted,
 * but statically rendered content (Preview panel, live site) never runs the
 * editor's code, so the `onclick` calls an undefined global function and
 * silently does nothing without this.
 */
export function initializeYouTubeJumpMarks(container: HTMLElement | null): void {
  if (!container || typeof window === 'undefined' || window.handleJumpMarkClick) return;

  window.handleJumpMarkClick = (element, _videoId, time) => {
    const jumpContainer = element.closest(`[${YOUTUBE_JUMP_MARKS_CONTAINER_ATTR}]`);
    if (!jumpContainer) return;

    const iframe = jumpContainer.querySelector('iframe');
    if (!iframe) return;

    const baseUrl = iframe.src.split('?')[0];
    iframe.src = `${baseUrl}?start=${time}&autoplay=1`;

    jumpContainer
      .querySelectorAll(`.${JUMP_MARK_ITEM_CLASS}`)
      .forEach((item) => item.classList.remove('bg-blue-100'));
    element.classList.add('bg-blue-100');
  };
}
