import { Node } from '@tiptap/core';
import type { Command } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import EditorNodeView from './components/EditorNodeView';
import { EMBED_FILES_ATTRIBUTES, MAX_FILES_COUNT, formatJinjaSyntax } from './utils';
import type { EmbedFileItem } from './types';
import type { User } from '../../../../types';

interface EmbedFilesCommandOptions {
  files: EmbedFileItem[];
}

/**
 * Extension-level config, set via EmbedFiles.configure() in RichTextInput and
 * read back by EditorNodeView (the "Edit files" modal needs user/setUser to
 * open its own nested ChooseAttachmentModal).
 */
interface EmbedFilesOptions {
  backendHost?: string;
  user?: User | null;
  setUser?: (user: User | null) => void;
  locale?: string;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    embedFiles: {
      setEmbedFiles: (options: EmbedFilesCommandOptions) => ReturnType;
    };
  }
}

/**
 * Embed Files extension for TipTap.
 * Each file reference is stored as {{ attachment('name') }} Jinja syntax in the rendered HTML.
 * The backend resolves this at page-render time to a locale-appropriate download link.
 */
export const EmbedFiles = Node.create<EmbedFilesOptions>({
  name: 'embedFiles',

  group: 'block',

  atom: true,

  addOptions() {
    return {
      backendHost: '',
      user: null,
      setUser: () => {},
      locale: undefined,
    };
  },

  addAttributes() {
    return {
      files: {
        default: [],
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: `div[${EMBED_FILES_ATTRIBUTES.CONTAINER}]`,
        getAttrs: (element) => {
          const text = element.textContent?.trim() || '';
          const attachmentPattern = /\{\{\s*attachment\('([^']+)'\)\s*\}\}/g;
          const files: EmbedFileItem[] = [];
          let match: RegExpExecArray | null;
          while ((match = attachmentPattern.exec(text)) !== null) {
            files.push({ attachmentName: match[1], displayName: match[1] });
          }
          if (files.length === 0) return false;
          return { files };
        },
      },
    ];
  },

  renderHTML({ node }) {
    const { files } = node.attrs as { files: EmbedFileItem[] };

    if (!files || files.length === 0) {
      return ['div', {}];
    }

    const jinjaContent = files.map((f) => formatJinjaSyntax(f.attachmentName)).join('\n');

    return ['div', { [EMBED_FILES_ATTRIBUTES.CONTAINER]: 'true' }, jinjaContent];
  },

  addNodeView() {
    return ReactNodeViewRenderer(EditorNodeView);
  },

  addCommands() {
    return {
      setEmbedFiles:
        (options: EmbedFilesCommandOptions): Command =>
        ({ commands }) => {
          if (!options.files || options.files.length === 0) {
            return false;
          }

          return commands.insertContent({
            type: this.name,
            attrs: { files: options.files.slice(0, MAX_FILES_COUNT) },
          });
        },
    };
  },
});

export default EmbedFiles;
