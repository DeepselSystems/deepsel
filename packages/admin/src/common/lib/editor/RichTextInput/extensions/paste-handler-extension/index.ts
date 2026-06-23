import { Node } from '@tiptap/core';
import type { Command } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { ReactNodeViewRenderer } from '@tiptap/react';
import EditorNodeView from './components/EditorNodeView';
import { PASTE_HANDLER_ATTRIBUTES } from './utils';
import type { PasteHandlerOptions } from './types';

interface SetPastedFilesOptions {
  files: File[];
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pasteHandler: {
      setPastedFiles: (options: SetPastedFilesOptions) => ReturnType;
    };
  }
}

/**
 * Paste Handler extension for TipTap
 * Temporarily displays pasted files in the editor before they are uploaded
 * This is a transient node that should not be persisted to database
 *
 * @example
 * ```typescript
 * import { PasteHandler } from './extensions/paste-handler-extension';
 *
 * const editor = useEditor({
 *   extensions: [
 *     PasteHandler.configure({
 *       backendHost: 'https://api.example.com',
 *       token: user?.token,
 *     }),
 *   ],
 * });
 * ```
 *
 * @requires backendHost - Backend API host URL for file uploads
 * @requires token - JWT authentication token for API requests
 */
export const PasteHandler = Node.create<PasteHandlerOptions>({
  name: 'pasteHandler',

  group: 'block',

  atom: true,

  addOptions() {
    return {
      enabled: true,
      onPaste: null,
      HTMLAttributes: {},
      backendHost: '',
      token: undefined,
      notify: undefined,
      locale: undefined,
    };
  },

  /**
   * Define node attributes
   * Files array temporarily holds pasted File objects for display
   */
  addAttributes() {
    return {
      files: {
        default: [],
      },
    };
  },

  /**
   * Parse HTML to node (for editor initialization)
   * This should rarely be triggered as the node is transient
   */
  parseHTML() {
    return [
      {
        tag: `div[${PASTE_HANDLER_ATTRIBUTES.CONTAINER}]`,
      },
    ];
  },

  /**
   * Render node to HTML (for serialization)
   * Returns hidden div since this node is transient and should not appear in saved content
   * The node is removed after files are uploaded via EditorNodeView component
   */
  renderHTML() {
    return ['div', { [PASTE_HANDLER_ATTRIBUTES.CONTAINER]: '', style: 'display: none;' }];
  },

  /**
   * Custom React component for editor display
   * Shows file list with upload progress and handles file upload
   */
  addNodeView() {
    return ReactNodeViewRenderer(EditorNodeView, {
      as: 'div',
      contentDOMElementTag: 'div',
    });
  },

  /**
   * Define editor commands
   * setPastedFiles: Insert pasted files as a temporary node in the editor
   */
  addCommands() {
    return {
      setPastedFiles:
        (options: SetPastedFilesOptions): Command =>
        ({ commands }) => {
          if (!options.files || options.files.length === 0) {
            return false;
          }

          return commands.insertContent({
            type: this.name,
            attrs: {
              files: options.files,
            },
          });
        },
    };
  },

  /**
   * Add ProseMirror plugin to intercept paste events
   * Detects file pastes and creates temporary pasteHandler nodes
   */
  addProseMirrorPlugins() {
    const editor = this.editor;

    return [
      new Plugin({
        key: new PluginKey('pasteHandler'),
        props: {
          handlePaste: (view: EditorView, event: ClipboardEvent) => {
            if (event.clipboardData && event.clipboardData.files.length > 0) {
              const files = Array.from(event.clipboardData.files);

              if (editor) {
                editor.commands.setPastedFiles({ files });
                return true;
              }
            }

            return false;
          },
        },
      }),
    ];
  },
});

export default PasteHandler;
