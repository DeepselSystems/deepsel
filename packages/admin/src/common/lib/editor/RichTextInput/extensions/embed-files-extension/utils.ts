/**
 * Maximum number of files allowed per embed block
 */
export const MAX_FILES_COUNT = 10;

/**
 * Attribute name used to identify embed-files nodes in HTML
 */
export const EMBED_FILES_ATTRIBUTES = {
  CONTAINER: 'data-embed-files',
} as const;

/**
 * CSS classes used by EditorNodeView for in-editor display.
 * Not present in the HTML saved to the database.
 */
export const EMBED_FILES_CLASSES = {
  WRAPPER: 'embed-files-wrapper',
  FILES_CONTAINER: 'embed-files-container',
  FILE_ITEM: 'embed-file-item',
  FILE_CONTENT: 'embed-file-content',
  FILE_ICON: 'embed-file-icon',
  FILE_LINK: 'embed-file-link',
} as const;

/**
 * Formats an attachment name into Jinja2 template syntax.
 * The backend resolves this to a locale-appropriate download link at render time.
 * @param attachmentName - The attachment.name column value (e.g. "annual-report-2024")
 */
export const formatJinjaSyntax = (attachmentName: string): string =>
  `{{ attachment('${attachmentName}') }}`;
