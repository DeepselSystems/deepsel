import { Node } from '@tiptap/core';
import type { Command } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import EditorNodeView from './components/EditorNodeView';
import { EMBED_AUDIO_ATTRIBUTES } from './utils';

interface EmbedAudioOptions {
  src: string;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    embedAudio: {
      setEmbedAudio: (options: EmbedAudioOptions) => ReturnType;
    };
  }
}

/**
 * Embed Audio extension for TipTap
 * Stores audio as Jinja syntax: {{ attachment('name') }}
 * Parses back via data-embed-audio marker on the wrapper div
 */
export const EmbedAudio = Node.create({
  name: 'embedAudio',

  group: 'block',

  atom: true,

  addAttributes() {
    return {
      src: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: `div[${EMBED_AUDIO_ATTRIBUTES.CONTAINER}]`,
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

    return ['div', { [EMBED_AUDIO_ATTRIBUTES.CONTAINER]: 'true' }, `{{ attachment('${src}') }}`];
  },

  addNodeView() {
    return ReactNodeViewRenderer(EditorNodeView);
  },

  addCommands() {
    return {
      setEmbedAudio:
        (options: EmbedAudioOptions): Command =>
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

export default EmbedAudio;
