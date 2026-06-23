/**
 * YouTube expression string
 */
export const YOUTUBE_REG_EXP = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;

/**
 * Constants for YouTube jump marks data attributes
 *
 * BE CAREFUL TO EDIT THIS - IT EFFECTS OLDER DATA
 */
export const YOUTUBE_JUMP_MARKS_ATTRIBUTES = {
  CONTAINER: 'data-youtube-jump-marks',
  JUMP_MARKS: 'data-jump-marks',
  SHOW_JUMP_MARKS: 'data-show-jump-marks',
  VIDEO_ID: 'data-video-id',
  TIME: 'data-time',
  TITLE: 'data-video-title',
} as const;

/**
 * Constants for YouTube jump marks CSS classes
 *
 * BE CAREFUL TO EDIT THIS - IT EFFECTS OLDER DATA
 */
export const YOUTUBE_JUMP_MARKS_CLASSES = {
  JUMP_MARK_ITEM: 'jump-mark-item',
} as const;

/**
 * Extract YouTube video ID from URL
 *
 * @param {string} url - YouTube URL
 * @returns {string|null} Video ID
 */
export const getVideoId = (url: string): string | null => {
  if (!url) return null;

  const match = url.match(YOUTUBE_REG_EXP);

  return match && match[2].length === 11 ? match[2] : null;
};

/**
 * YouTube Jump Marks utility functions for website rendering
 * Provides functionality to handle jump mark clicks on the frontend
 */

declare global {
  interface Window {
    handleJumpMarkClick?: (element: HTMLElement, videoId: string, time: number) => void;
  }
}

/**
 * Inject handleJumpMarkClick function into global scope if not already present
 * This function handles clicking on jump marks to seek to specific times in YouTube videos
 */
export const injectYouTubeJumpMarkHandler = (): void => {
  if (typeof window !== 'undefined' && !window.handleJumpMarkClick) {
    /**
     * Handle jump mark click to seek to specific time in YouTube video
     * @param {HTMLElement} element - The clicked jump mark element
     * @param {string} videoId - YouTube video ID
     * @param {number} time - Time in seconds to jump to
     */
    window.handleJumpMarkClick = (element: HTMLElement, videoId: string, time: number) => {
      const container = element.closest(`[${YOUTUBE_JUMP_MARKS_ATTRIBUTES.CONTAINER}]`);
      if (!container) return;

      const iframe = container.querySelector('iframe');
      if (!iframe) return;

      const currentSrc = iframe.src;
      const baseUrl = currentSrc.split('?')[0];
      iframe.src = `${baseUrl}?start=${time}&autoplay=1`;

      const allItems = container.querySelectorAll(`.${YOUTUBE_JUMP_MARKS_CLASSES.JUMP_MARK_ITEM}`);
      allItems.forEach((item) => item.classList.remove('bg-blue-100'));

      element.classList.add('bg-blue-100');
    };
  }
};

/**
 * Check if content contains YouTube jump marks
 * @param {string} htmlContent - HTML content to check
 * @returns {boolean} True if content contains YouTube jump marks
 */
export const containsYouTubeJumpMarks = (htmlContent: string): boolean => {
  if (!htmlContent || typeof htmlContent !== 'string') {
    return false;
  }

  return htmlContent.includes(`${YOUTUBE_JUMP_MARKS_ATTRIBUTES.CONTAINER}="true"`);
};

/**
 * Initialize YouTube jump marks functionality for a container
 * @param {HTMLElement} container - Container element to initialize
 */
export const initializeYouTubeJumpMarks = (container: HTMLElement | null): void => {
  if (!container) return;

  injectYouTubeJumpMarkHandler();

  const jumpMarkItems = container.querySelectorAll(
    `.${YOUTUBE_JUMP_MARKS_CLASSES.JUMP_MARK_ITEM}[${YOUTUBE_JUMP_MARKS_ATTRIBUTES.TIME}]`,
  );

  jumpMarkItems.forEach((item) => {
    if (!item.getAttribute('onclick')) {
      const time = item.getAttribute(YOUTUBE_JUMP_MARKS_ATTRIBUTES.TIME);
      const videoContainer = item.closest(`[${YOUTUBE_JUMP_MARKS_ATTRIBUTES.CONTAINER}]`);

      if (time && videoContainer) {
        const iframe = videoContainer.querySelector('iframe');
        if (iframe) {
          const src = iframe.getAttribute('src');
          const videoIdMatch = src?.match(/\/embed\/([^?]+)/);
          const videoId = videoIdMatch ? videoIdMatch[1] : '';

          if (videoId) {
            item.setAttribute('onclick', `handleJumpMarkClick(this, '${videoId}', ${time})`);
          }
        }
      }
    }
  });
};
