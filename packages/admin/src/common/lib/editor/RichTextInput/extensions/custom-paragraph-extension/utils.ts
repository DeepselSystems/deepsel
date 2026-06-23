import type { Node } from '@tiptap/pm/model';

/**
 * Constants for custom paragraph attributes
 * BE CAREFUL TO EDIT THIS - IT AFFECTS OLDER DATA
 */
export const CUSTOM_PARAGRAPH_ATTRIBUTES = {
  PLACEHOLDER: 'data-placeholder',
  EMPTY_CLASS: 'is-empty',
} as const;

/**
 * Check if a paragraph node is empty
 * @param {Object} node - ProseMirror node
 * @returns {boolean} True if paragraph is empty
 */
export const isParagraphEmpty = (node: Node | null | undefined): boolean => {
  if (!node) return false;
  return !node.textContent || node.textContent.length === 0;
};

/**
 * Check if content contains empty paragraphs with placeholder
 * @param {HTMLElement} container - Container element to check
 * @returns {boolean} True if empty paragraphs are found
 */
export const containsEmptyParagraphs = (container: HTMLElement | null): boolean => {
  if (!container) return false;

  return container.querySelector(`p.${CUSTOM_PARAGRAPH_ATTRIBUTES.EMPTY_CLASS}`) !== null;
};
