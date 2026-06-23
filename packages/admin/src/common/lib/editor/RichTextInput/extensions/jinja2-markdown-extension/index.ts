import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { JINJA2_ATTRIBUTES, JINJA2_PATTERNS } from './utils';
import type { Jinja2HighlightOptions } from './types';

/**
 * Jinja2 Markdown Extension for TipTap
 * Provides enhanced support for Jinja2 template syntax in the editor
 * Features include syntax highlighting with code-like styling
 * Supports: {{ variable }}, {% tag %}, {# comment #}
 *
 * This extension uses ProseMirror decorations to apply visual enhancements
 * without modifying the actual content or saved HTML
 */
export const jinja2Markdown = Extension.create<Jinja2HighlightOptions>({
  name: 'jinja2Markdown',

  /**
   * Extension options
   * @returns {Object} Default options
   */
  addOptions() {
    return {
      enabled: true,
      HTMLAttributes: {
        class: JINJA2_ATTRIBUTES.CLASS,
      },
    };
  },

  /**
   * Add ProseMirror plugins
   * Provides visual enhancements including syntax highlighting for Jinja2 in the editor
   * @returns {Array<Plugin>} Array of ProseMirror plugins
   */
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('jinja2Highlight'),
        props: {
          /**
           * Apply decorations for Jinja2 syntax
           * @param {EditorState} state - Current editor state
           * @returns {DecorationSet} Set of decorations to apply
           */
          decorations: (state: EditorState) => {
            if (!this.options.enabled) {
              return DecorationSet.empty;
            }

            const decorations: Decoration[] = [];
            const { doc } = state;

            doc.descendants((node, pos) => {
              if (!node.isText) return;

              const text = node.text;

              if (!text) return;

              JINJA2_PATTERNS.forEach((pattern) => {
                const regex = new RegExp(pattern);
                let match;

                while ((match = regex.exec(text)) !== null) {
                  const from = pos + match.index;
                  const to = from + match[0].length;

                  decorations.push(
                    Decoration.inline(from, to, {
                      class: JINJA2_ATTRIBUTES.CLASS,
                    }),
                  );
                }
              });
            });

            return DecorationSet.create(doc, decorations);
          },
        },
      }),
    ];
  },
});

export default jinja2Markdown;
