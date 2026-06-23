import { common, createLowlight } from 'lowlight';
import type { Root, RootContent } from 'hast';

/**
 * Create lowlight instance with common languages
 */
const lowlight = createLowlight(common);

type HastNode = Root | RootContent;

/**
 * Convert HAST (Hypertext Abstract Syntax Tree) node to HTML string
 * @param {Object} node - HAST node from lowlight
 * @returns {string} HTML string
 */
const hastNodeToHtml = (node: HastNode): string => {
  if (node.type === 'text') {
    return node.value || '';
  }

  if (node.type === 'element') {
    const tag = node.tagName;
    const classes = node.properties?.className;
    const classAttr = classes ? ` class="${(classes as string[]).join(' ')}"` : '';
    const children = (node.children || []).map(hastNodeToHtml).join('');
    return `<${tag}${classAttr}>${children}</${tag}>`;
  }

  if (node.type === 'root' || 'children' in node) {
    return ((node as Root).children || []).map(hastNodeToHtml).join('');
  }

  return '';
};

/**
 * Constants for enhanced code block attributes and classes
 */
export const ENHANCED_CODE_BLOCK_ATTRIBUTES = {
  CONTAINER: 'data-enhanced-code-block',
  LANGUAGE: 'data-language',
} as const;

export const ENHANCED_CODE_BLOCK_CLASSES = {
  WRAPPER: 'enhanced-code-block-wrapper',
  HEADER: 'enhanced-code-block-header',
  LANGUAGE_LABEL: 'enhanced-code-block-language',
  CONTENT: 'enhanced-code-block-content',
  LINE_NUMBER: 'enhanced-code-block-line-number',
  LINE_CONTENT: 'enhanced-code-block-line-content',
} as const;

/**
 * List of supported programming languages
 */
export const PROGRAMMING_LANGUAGES = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'csharp', label: 'C#' },
  { value: 'cpp', label: 'C++' },
  { value: 'c', label: 'C' },
  { value: 'php', label: 'PHP' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'swift', label: 'Swift' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'scala', label: 'Scala' },
  { value: 'r', label: 'R' },
  { value: 'sql', label: 'SQL' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'scss', label: 'SCSS' },
  { value: 'json', label: 'JSON' },
  { value: 'xml', label: 'XML' },
  { value: 'yaml', label: 'YAML' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'bash', label: 'Bash' },
  { value: 'shell', label: 'Shell' },
  { value: 'powershell', label: 'PowerShell' },
  { value: 'dockerfile', label: 'Dockerfile' },
  { value: 'plaintext', label: 'Plain Text' },
] as const;

/**
 * Get language label by value
 * @param {string} value - Language value
 * @returns {string} Language label
 */
export const getLanguageLabel = (value: string): string => {
  const language = PROGRAMMING_LANGUAGES.find((lang) => lang.value === value);
  return language ? language.label : value || 'Plain Text';
};

/**
 * Check if content contains enhanced code blocks
 * @param {HTMLElement} container - Container element to check
 * @returns {boolean} True if enhanced code blocks are found
 */
export const containsEnhancedCodeBlocks = (container: HTMLElement | null): boolean => {
  if (!container) return false;

  return (
    container.querySelector(`[${ENHANCED_CODE_BLOCK_ATTRIBUTES.CONTAINER}]`) !== null ||
    container.querySelector(`.${ENHANCED_CODE_BLOCK_CLASSES.WRAPPER}`) !== null
  );
};

/**
 * Initialize enhanced code blocks functionality for a container
 * @param {HTMLElement} container - Container element with enhanced code blocks
 */
export const initializeEnhancedCodeBlocks = (container: HTMLElement | null): void => {
  if (!container) return;

  const enhancedCodeBlockWrappers = [
    ...Array.from(container.querySelectorAll(`[${ENHANCED_CODE_BLOCK_ATTRIBUTES.CONTAINER}]`)),
    ...Array.from(container.querySelectorAll(`.${ENHANCED_CODE_BLOCK_CLASSES.WRAPPER}`)),
  ];

  enhancedCodeBlockWrappers.forEach((wrapper) => {
    const language = wrapper.getAttribute(ENHANCED_CODE_BLOCK_ATTRIBUTES.LANGUAGE) || 'plaintext';

    let header = wrapper.querySelector(`.${ENHANCED_CODE_BLOCK_CLASSES.HEADER}`);
    if (!header) {
      header = document.createElement('div');
      header.className = ENHANCED_CODE_BLOCK_CLASSES.HEADER;
      wrapper.insertBefore(header, wrapper.firstChild);
    }

    let languageLabel = header.querySelector(`.${ENHANCED_CODE_BLOCK_CLASSES.LANGUAGE_LABEL}`);
    if (!languageLabel) {
      languageLabel = document.createElement('span');
      languageLabel.className = ENHANCED_CODE_BLOCK_CLASSES.LANGUAGE_LABEL;
      header.appendChild(languageLabel);
    }

    languageLabel.textContent = getLanguageLabel(language);

    const preElement = wrapper.querySelector('pre');
    const codeElement = preElement?.querySelector('code');

    if (preElement && codeElement) {
      const rawCode = codeElement.textContent || '';

      try {
        let highlightedHtml = rawCode;

        if (language && language !== 'plaintext' && lowlight.registered(language)) {
          const result = lowlight.highlight(language, rawCode);
          highlightedHtml = hastNodeToHtml(result);
        }

        preElement.innerHTML = highlightedHtml;
        if (preElement instanceof HTMLElement) {
          preElement.style.whiteSpace = 'pre-wrap';
        }
      } catch (error) {
        console.warn('Enhanced code block: syntax highlighting failed', error);
      }
    }
  });
};
