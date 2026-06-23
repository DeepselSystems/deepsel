import { mergeAttributes, Node } from '@tiptap/core';
import type { Command } from '@tiptap/core';

interface YoutubeEmbedOptions {
  src: string;
  width?: number;
  height?: number;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    youtubeEmbed: {
      setYoutubeVideo: (options: YoutubeEmbedOptions) => ReturnType;
    };
  }
}

export function getEmbedUrl(url: string): string | null {
  if (!url) {
    return null;
  }

  const youtubeRegExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(youtubeRegExp);

  const videoId = match && match[2].length === 11 ? match[2] : url;

  return `https://www.youtube.com/embed/${videoId}`;
}

export const YoutubeEmbed = Node.create({
  name: 'youtubeEmbed',

  group: 'block',

  atom: true,

  addOptions() {
    return {
      HTMLAttributes: {
        class: 'w-full aspect-video my-4',
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
    };
  },

  parseHTML() {
    return [
      {
        tag: 'iframe[src*="youtube.com"], iframe[src*="youtu.be"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const embedUrl = getEmbedUrl(HTMLAttributes.src);

    return [
      'div',
      { class: 'youtube-embed-wrapper' },
      [
        'iframe',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        mergeAttributes(this.options.HTMLAttributes, {
          width: HTMLAttributes.width,
          height: HTMLAttributes.height,
          src: embedUrl,
          frameborder: 0,
          allow:
            'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
          allowfullscreen: true,
        }),
      ],
    ];
  },

  addCommands() {
    return {
      setYoutubeVideo:
        (options: YoutubeEmbedOptions): Command =>
        ({ commands }) => {
          if (!options.src) {
            return false;
          }

          return commands.insertContent({
            type: this.name,
            attrs: options,
          });
        },
    };
  },
});

export default YoutubeEmbed;
