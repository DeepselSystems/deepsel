import { Node } from '@tiptap/core';
import type { Command } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import EditorNodeView from './components/EditorNodeView';
import { EMBED_VIDEO_ATTRIBUTES } from './utils';

interface EmbedVideoOptions {
  src?: string;

  /** ISO code of the active editor locale (e.g. "en", "fr"). Passed to getAttachmentByNameRelativeUrl. */
  locale?: string;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    embedVideo: {
      setEmbedVideo: (options: EmbedVideoOptions) => ReturnType;
    };
  }
}

/**
 * Embed Video extension for TipTap
 * Stores video as Jinja syntax: {{ attachment('name') }}
 * Parses back via data-embed-video marker on the wrapper div
 */
export const EmbedVideo = Node.create<EmbedVideoOptions>({
  name: 'embedVideo',

  group: 'block',

  atom: true,

  addOptions() {
    return {
      locale: undefined,
      src: undefined,
    };
  },

  addAttributes() {
    return {
      src: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: `div[${EMBED_VIDEO_ATTRIBUTES.CONTAINER}]`,
        getAttrs: (element) => {
          const text = element.textContent?.trim() || '';
          const match = text.match(
            /^\{\{\s*attachment\('([^']+)'(?:,\s*(\{[\s\S]*\}))?\s*\)\s*\}\}$/,
          );
          if (!match) return false;

          return { src: match[1] };
        },
      },
    ];
  },

  renderHTML({ node }) {
    const { src } = node.attrs;

    if (!src) {
      return ['div', {}];
    }

    return ['div', { [EMBED_VIDEO_ATTRIBUTES.CONTAINER]: 'true' }, `{{ attachment('${src}') }}`];
  },

  addNodeView() {
    return ReactNodeViewRenderer(EditorNodeView);
  },

  addCommands() {
    return {
      setEmbedVideo:
        (options: EmbedVideoOptions): Command =>
        ({ commands }) => {
          if (!options.src) {
            return false;
          }
          return commands.insertContent({
            type: this.name,
            attrs: { src: options.src },
          });
        },
    };
  },
});

export default EmbedVideo;
