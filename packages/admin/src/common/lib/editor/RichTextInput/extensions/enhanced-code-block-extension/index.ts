import { mergeAttributes } from '@tiptap/core';
import type { Command } from '@tiptap/core';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { common, createLowlight } from 'lowlight';
import EditorNodeView from './components/EditorNodeView';
import {
  ENHANCED_CODE_BLOCK_ATTRIBUTES,
  ENHANCED_CODE_BLOCK_CLASSES,
  getLanguageLabel,
} from './utils';

/**
 * Create lowlight instance with common languages
 */
const lowlight = createLowlight(common);

interface EnhancedCodeBlockAttributes {
  language?: string;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    enhancedCodeBlock: {
      setEnhancedCodeBlock: (attributes?: EnhancedCodeBlockAttributes) => ReturnType;
      toggleEnhancedCodeBlock: (attributes?: EnhancedCodeBlockAttributes) => ReturnType;
    };
  }
}

/**
 * Enhanced Code Block extension with syntax highlighting
 * Extends CodeBlockLowlight with language selection and line numbers
 */
export const EnhancedCodeBlock = CodeBlockLowlight.extend({
  name: 'enhancedCodeBlock',

  addOptions() {
    return {
      ...this.parent?.(),
      lowlight,
      defaultLanguage: 'plaintext',
      HTMLAttributes: {
        class: ENHANCED_CODE_BLOCK_CLASSES.WRAPPER,
      },
    };
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      language: {
        default: this.options.defaultLanguage,
        parseHTML: (element) => {
          const dataLanguage = element.getAttribute(ENHANCED_CODE_BLOCK_ATTRIBUTES.LANGUAGE);
          if (dataLanguage) {
            return dataLanguage;
          }

          const { languageClassPrefix } = this.options;

          const classNames = Array.from(element.firstElementChild?.classList || []);
          const languages = classNames
            .filter((className) => className.startsWith(languageClassPrefix))
            .map((className) => className.replace(languageClassPrefix, ''));
          const language = languages[0];

          if (!language) {
            return null;
          }

          return language;
        },
        rendered: false,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: `div[${ENHANCED_CODE_BLOCK_ATTRIBUTES.CONTAINER}]`,
        preserveWhitespace: 'full',
        contentElement: (element) => {
          return element.querySelector('pre') || element;
        },
        getAttrs: (element) => {
          const language =
            element.getAttribute(ENHANCED_CODE_BLOCK_ATTRIBUTES.LANGUAGE) ||
            this.options.defaultLanguage;

          return {
            language,
          };
        },
      },
      {
        tag: `div.${ENHANCED_CODE_BLOCK_CLASSES.WRAPPER}`,
        preserveWhitespace: 'full',
        contentElement: (element) => {
          return element.querySelector('pre') || element;
        },
        getAttrs: (element) => {
          const language =
            element.getAttribute(ENHANCED_CODE_BLOCK_ATTRIBUTES.LANGUAGE) ||
            this.options.defaultLanguage;

          return {
            language,
          };
        },
      },
      {
        tag: 'pre',
        preserveWhitespace: 'full',
        getAttrs: (element) => {
          const code = element.querySelector('code');
          if (!code) return false;

          const { languageClassPrefix } = this.options;
          const classNames = Array.from(code.classList || []);
          const languages = classNames
            .filter((className) => className.startsWith(languageClassPrefix))
            .map((className) => className.replace(languageClassPrefix, ''));
          const language = languages[0] || this.options.defaultLanguage;

          return {
            language,
          };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { language } = node.attrs;

    const codeElement = [
      'code',
      {
        class: this.options.languageClassPrefix + language,
      },
      0,
    ];

    const preElement = ['pre', codeElement];

    const headerElement = [
      'div',
      {
        class: ENHANCED_CODE_BLOCK_CLASSES.HEADER,
      },
      [
        'span',
        {
          class: ENHANCED_CODE_BLOCK_CLASSES.LANGUAGE_LABEL,
        },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        getLanguageLabel(language),
      ],
    ];

    const contentElement = [
      'div',
      {
        class: ENHANCED_CODE_BLOCK_CLASSES.CONTENT,
      },
      preElement,
    ];

    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        class: ENHANCED_CODE_BLOCK_CLASSES.WRAPPER,
        [ENHANCED_CODE_BLOCK_ATTRIBUTES.CONTAINER]: 'true',
        [ENHANCED_CODE_BLOCK_ATTRIBUTES.LANGUAGE]: language,
      }),
      headerElement,
      contentElement,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(EditorNodeView);
  },

  addCommands() {
    return {
      ...this.parent?.(),
      setEnhancedCodeBlock:
        (attributes?: EnhancedCodeBlockAttributes): Command =>
        ({ commands }) => {
          return commands.setNode(this.name, attributes);
        },
      toggleEnhancedCodeBlock:
        (attributes?: EnhancedCodeBlockAttributes): Command =>
        ({ commands }) => {
          return commands.toggleNode(this.name, 'paragraph', attributes);
        },
    };
  },
});

export default EnhancedCodeBlock;
