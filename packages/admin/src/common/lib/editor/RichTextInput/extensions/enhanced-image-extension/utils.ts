/**
 * Default image width
 */
export const IMAGE_WIDTH_DEFAULT = 300;

/**
 * Constants for enhanced image attributes and classes
 */
export const ENHANCED_IMAGE_ATTRIBUTES = {
  CONTAINER: 'data-enhanced-image',
  DESCRIPTION: 'data-description',
  ALIGNMENT: 'data-alignment',
  ROUNDED: 'data-rounded',
  CIRCLE: 'data-circle',
  WIDTH: 'data-width',
  HEIGHT: 'data-height',
  INLINE: 'data-inline',
} as const;

export const ENHANCED_IMAGE_CLASSES = {
  WRAPPER: 'enhanced-image-wrapper',
  DESCRIPTION: 'enhanced-image-description',
} as const;

/**
 * Constants for enhanced image alignment values
 */
export const ENHANCED_IMAGE_ALIGNMENTS = {
  LEFT: 'left',
  CENTER: 'center',
  RIGHT: 'right',
} as const;
