import { mergeAttributes, Node } from '@tiptap/core';
import type { Command } from '@tiptap/core';
import {
  AUTHENTICATED_CONTENT_ATTRIBUTES,
  AUTHENTICATED_CONTENT_CLASSES,
  AUTHENTICATED_CONTENT_DEFAULT_CONTENT,
} from './utils';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    authenticatedContent: {
      setAuthenticatedContent: () => ReturnType;
    };
  }
}

/**
 * Authenticated Content extension for TipTap
 * Allows defining regions that are only visible to authenticated users
 */
export const AuthenticatedContent = Node.create({
  name: 'authenticatedContent',

  group: 'block',

  content: 'text*',

  defining: true,

  addOptions() {
    return {
      HTMLAttributes: {
        class: AUTHENTICATED_CONTENT_CLASSES.WRAPPER,
      },
    };
  },

  addAttributes() {
    return {};
  },

  parseHTML() {
    return [
      {
        tag: `div[${AUTHENTICATED_CONTENT_ATTRIBUTES.CONTAINER}]`,
      },
      {
        tag: `div.${AUTHENTICATED_CONTENT_CLASSES.WRAPPER}`,
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes as Record<string, string>, HTMLAttributes, {
        [AUTHENTICATED_CONTENT_ATTRIBUTES.CONTAINER]: 'true',
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setAuthenticatedContent:
        (): Command =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            content: [
              {
                type: 'text',
                text: AUTHENTICATED_CONTENT_DEFAULT_CONTENT,
              },
            ],
          });
        },
    };
  },
});

export default AuthenticatedContent;
