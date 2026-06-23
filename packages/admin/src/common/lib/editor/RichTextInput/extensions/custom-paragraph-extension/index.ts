import { mergeAttributes } from '@tiptap/core';
import Paragraph from '@tiptap/extension-paragraph';
import type { Node } from '@tiptap/pm/model';
import { CUSTOM_PARAGRAPH_ATTRIBUTES, isParagraphEmpty } from './utils';

/**
 * Custom Paragraph extension for TipTap
 * Preserves empty state attributes in HTML output
 * Extends the default Paragraph to include data-placeholder and class="is-empty" when empty
 */
export const CustomParagraph = Paragraph.extend({
  name: 'paragraph',

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  parseHTML() {
    return [
      {
        tag: 'p',
        getAttrs: () => {
          return {};
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes, node }: { HTMLAttributes: Record<string, any>; node: Node }) {
    const isEmpty = isParagraphEmpty(node);

    const attrs = mergeAttributes(this.options.HTMLAttributes, HTMLAttributes);

    if (isEmpty) {
      attrs.class = attrs.class
        ? `${attrs.class} ${CUSTOM_PARAGRAPH_ATTRIBUTES.EMPTY_CLASS}`
        : CUSTOM_PARAGRAPH_ATTRIBUTES.EMPTY_CLASS;
    }

    return ['p', attrs, 0];
  },
});

export default CustomParagraph;
