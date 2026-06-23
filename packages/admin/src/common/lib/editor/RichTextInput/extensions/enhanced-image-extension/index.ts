import { Node } from '@tiptap/core';
import type { Command } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import EditorNodeView from './components/EditorNodeView';
import { ENHANCED_IMAGE_ALIGNMENTS, ENHANCED_IMAGE_ATTRIBUTES, IMAGE_WIDTH_DEFAULT } from './utils';

interface EnhancedImageAttributes {
  src: string;
  alt?: string;
  title?: string;
  width?: number;
  height?: number;
  alignment?: string;
  rounded?: boolean;
  circle?: boolean;
  inline?: boolean;
  description?: string;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    enhancedImage: {
      setEnhancedImage: (options: EnhancedImageAttributes) => ReturnType;
    };
  }
}

interface EnhancedImageOptions {
  /** ISO code of the active editor locale (e.g. "en", "fr"). Passed to getAttachmentByNameRelativeUrl. */
  locale?: string;
}

/**
 * Enhanced Image extension with description support
 * Stores images as Jinja syntax: {{ attachment('name', {...attrs}) }}
 * Parses back both old HTML format (backward compat) and new Jinja format
 */
export const EnhancedImage = Node.create<EnhancedImageOptions>({
  name: 'enhancedImage',

  group: 'block',

  atom: true,

  addOptions() {
    return {
      locale: undefined,
    };
  },

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      title: { default: null },
      width: { default: IMAGE_WIDTH_DEFAULT },
      height: { default: null },
      alignment: { default: ENHANCED_IMAGE_ALIGNMENTS.CENTER },
      rounded: { default: true },
      circle: { default: false },
      inline: { default: false },
      description: { default: '' },
    };
  },

  parseHTML() {
    return [
      {
        // New Jinja format: <div data-enhanced-image>{{ attachment('name', {...}) }}</div>
        tag: `div[${ENHANCED_IMAGE_ATTRIBUTES.CONTAINER}]`,
        getAttrs: (element) => {
          const text = element.textContent?.trim() || '';
          const match = text.match(
            /^\{\{\s*attachment\('([^']+)'(?:,\s*(\{[\s\S]*\}))?\s*\)\s*\}\}$/,
          );
          if (!match) return false;

          const src = match[1];
          let attrs: Record<string, unknown> = {};
          try {
            attrs = JSON.parse(match[2] || '{}');
          } catch {}

          return {
            src,
            alignment: (attrs.alignment as string) || ENHANCED_IMAGE_ALIGNMENTS.CENTER,
            rounded: attrs.rounded !== undefined ? Boolean(attrs.rounded) : true,
            circle: Boolean(attrs.circle),
            inline: Boolean(attrs.inline),
            width: (attrs.width as number) || IMAGE_WIDTH_DEFAULT,
            height: (attrs.height as number) || null,
            description: (attrs.description as string) || '',
          };
        },
      },
    ];
  },

  renderHTML({ node }) {
    const { src, alignment, rounded, circle, inline, width, height, description } = node.attrs;

    if (!src) {
      return ['div', {}];
    }

    const attrs = JSON.stringify({
      alignment: alignment || ENHANCED_IMAGE_ALIGNMENTS.CENTER,
      rounded: rounded ?? true,
      circle: circle ?? false,
      inline: inline ?? false,
      width: width || IMAGE_WIDTH_DEFAULT,
      ...(height ? { height } : {}),
      ...(description ? { description } : {}),
    });

    return [
      'div',
      { [ENHANCED_IMAGE_ATTRIBUTES.CONTAINER]: 'true' },
      `{{ attachment('${src}', ${attrs}) }}`,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(EditorNodeView);
  },

  addCommands() {
    return {
      setEnhancedImage:
        (options: EnhancedImageAttributes): Command =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: options,
          });
        },
    };
  },
});

export default EnhancedImage;
