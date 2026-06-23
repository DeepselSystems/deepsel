import { mergeAttributes, Node } from '@tiptap/core';
import type { Command } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { getVideoId, injectYouTubeJumpMarkHandler, YOUTUBE_JUMP_MARKS_ATTRIBUTES } from './utils';
import EditorNodeView from './components/EditorNodeView';
import type { JumpMark, JumpMarkData } from './types';

/**
 * Convert YouTube URL to embed format
 * @param {string} url - YouTube URL
 * @returns {string|null} Embed URL
 */
const getEmbedUrl = (url: string): string | null => {
  if (!url) return null;

  const videoId = getVideoId(url);
  if (!videoId) return url;

  return `https://www.youtube.com/embed/${videoId}`;
};

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    youtubeJumpMarks: {
      setYoutubeVideoWithJumpMarks: (data: JumpMarkData) => ReturnType;
    };
  }
}

/**
 * YouTube extension with jump marks support
 * Allows embedding YouTube videos with clickable time-based jump marks
 */
export const YoutubeJumpMarks = Node.create({
  name: 'youtubeJumpMarks',

  group: 'block',

  atom: true,

  addOptions() {
    return {
      HTMLAttributes: {
        class: 'youtube-jump-mark-wrapper',
      },
    };
  },

  addAttributes() {
    return {
      src: {
        default: null,
      },
      width: {
        default: 640,
      },
      height: {
        default: 480,
      },
      title: {
        default: null,
        parseHTML: (element) => {
          return element.getAttribute(YOUTUBE_JUMP_MARKS_ATTRIBUTES.TITLE) || null;
        },
      },
      jumpMarks: {
        default: [],
        parseHTML: (element) => {
          const jumpMarksData = element.getAttribute(YOUTUBE_JUMP_MARKS_ATTRIBUTES.JUMP_MARKS);
          try {
            return jumpMarksData ? JSON.parse(jumpMarksData) : [];
          } catch (error) {
            console.error('Failed to parse jump marks:', error);
            return [];
          }
        },
      },
      showJumpMarks: {
        default: true,
        parseHTML: (element) => {
          return element.getAttribute(YOUTUBE_JUMP_MARKS_ATTRIBUTES.SHOW_JUMP_MARKS) !== 'false';
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: `div[${YOUTUBE_JUMP_MARKS_ATTRIBUTES.CONTAINER}]`,
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const embedUrl = getEmbedUrl(HTMLAttributes?.src);
    const jumpMarks = (HTMLAttributes.jumpMarks as JumpMark[]) || [];
    const showJumpMarks = HTMLAttributes.showJumpMarks !== false;
    const videoTitle = HTMLAttributes.title || '';

    const iframeElement = [
      'div',
      { class: 'youtube-embed-wrapper' },
      [
        'iframe',
        mergeAttributes({
          width: HTMLAttributes.width,
          height: HTMLAttributes.height,
          src: embedUrl,
          frameborder: 0,
          allow:
            'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
          allowfullscreen: true,
          class: 'w-full h-full',
        }),
      ],
    ];

    const titleElement = videoTitle
      ? ['div', { class: 'jump-mark-youtube-title' }, videoTitle]
      : null;

    /**
     * Format time in seconds to MM:SS format
     * @param {number} seconds - Time in seconds
     * @returns {string} Formatted time string
     */
    const formatTime = (seconds: number): string => {
      if (typeof seconds !== 'number' || isNaN(seconds) || seconds < 0) {
        return '00:00';
      }
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = Math.floor(seconds % 60);
      return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    };

    /**
     * Validate jump mark structure
     * @param {any} jumpMark - Jump mark to validate
     * @returns {boolean} True if valid jump mark
     */
    const isValidJumpMark = (jumpMark: JumpMark): boolean => {
      return (
        jumpMark &&
        typeof jumpMark === 'object' &&
        typeof jumpMark.time === 'number' &&
        !isNaN(jumpMark.time) &&
        jumpMark.time >= 0 &&
        typeof jumpMark.label === 'string' &&
        jumpMark.label.trim().length > 0
      );
    };

    const jumpMarksElement =
      showJumpMarks && jumpMarks.length > 0
        ? [
            'div',
            {
              class: 'jump-marks-list',
            },
            ...jumpMarks.filter(isValidJumpMark).map((jumpMark) => [
              'div',
              {
                class: 'jump-mark-item',
                // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
                onclick: `handleJumpMarkClick(this, '${getVideoId(HTMLAttributes?.src)}', ${jumpMark.time})`,
                [YOUTUBE_JUMP_MARKS_ATTRIBUTES.TIME]: jumpMark.time,
              },
              [
                'div',
                {
                  class: 'jump-mark-time',
                },
                formatTime(jumpMark.time),
              ],
              [
                'div',
                { class: 'jump-mark-content' },
                [
                  'div',
                  {
                    class: 'jump-mark-label',
                  },
                  jumpMark.label,
                ],
                jumpMark.description &&
                typeof jumpMark.description === 'string' &&
                jumpMark.description.trim().length > 0
                  ? [
                      'div',
                      {
                        class: 'jump-mark-description',
                      },
                      jumpMark.description,
                    ]
                  : null,
              ].filter(Boolean),
            ]),
          ]
        : null;

    const elements = [iframeElement];
    if (titleElement) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      elements.push(titleElement);
    }
    if (jumpMarksElement) {
      elements.push(jumpMarksElement);
    }

    return [
      'div',
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      mergeAttributes(this.options.HTMLAttributes, {
        [YOUTUBE_JUMP_MARKS_ATTRIBUTES.CONTAINER]: 'true',
        [YOUTUBE_JUMP_MARKS_ATTRIBUTES.JUMP_MARKS]: JSON.stringify(jumpMarks),
        [YOUTUBE_JUMP_MARKS_ATTRIBUTES.SHOW_JUMP_MARKS]: showJumpMarks.toString(),
        [YOUTUBE_JUMP_MARKS_ATTRIBUTES.TITLE]: videoTitle,
        src: HTMLAttributes.src,
        width: HTMLAttributes.width,
        height: HTMLAttributes.height,
      }),
      ...elements,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(EditorNodeView);
  },

  addCommands() {
    return {
      setYoutubeVideoWithJumpMarks:
        (data: JumpMarkData): Command =>
        ({ commands }) => {
          if (!data.src) {
            return false;
          }

          return commands.insertContent({
            type: this.name,
            attrs: {
              src: data.src,
              width: data.width || 640,
              height: data.height || 480,
              title: data.title || '',
              jumpMarks: data.jumpMarks || [],
              showJumpMarks: data.showJumpMarks !== false,
            },
          });
        },
    };
  },

  /**
   * Add global script for handling jump mark clicks
   */
  onBeforeCreate() {
    injectYouTubeJumpMarkHandler();
  },
});

export default YoutubeJumpMarks;
