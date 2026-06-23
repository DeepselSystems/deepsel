/**
 * Height of the attachment card preview area in pixels.
 */
export const CARD_HEIGHT_PX = 150;

/**
 * Height of locale flag icons in pixels.
 */
export const FLAG_HEIGHT_PX = 16;

/**
 * Debounce delay for the media library search input in milliseconds.
 */
export const SEARCH_DEBOUNCE_MS = 250;

/**
 * ISO country code used as the fallback flag when no matching SVG is found.
 * 'un' = United Nations flag, always present in admin/public/svgflags/.
 */
export const FALLBACK_FLAG_CODE = 'un';

/**
 * Base path for SVG flag images.
 * Strategy: files are copied from client/public/svgflags/ into admin/public/svgflags/
 * and served by Vite's public directory at /svgflags/{code}.svg.
 */
export const SVG_FLAGS_BASE_PATH = '/svgflags';

/**
 * Base path for file type icon images served from admin/public/images/fileTypeIcons/
 */
export const FILE_TYPE_ICONS_BASE_PATH = '/images/fileTypeIcons';

/**
 * File extensions that have a dedicated icon in FILE_TYPE_ICONS_BASE_PATH.
 * Any extension not in this list falls back to generic.png.
 */
export const SUPPORTED_FILE_TYPE_ICON_EXTENSIONS = [
  'doc',
  'docx',
  'pdf',
  'ppt',
  'pptx',
  'xls',
  'xlsx',
  'zip',
  'rar',
  'mp4',
  'mov',
  'mkv',
  'webm',
];
