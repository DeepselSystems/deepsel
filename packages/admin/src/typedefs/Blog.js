/**
 * @typedef BlogPost
 *
 * @property {number} id
 * @property {boolean} published
 * @property {string} slug
 * @property {string | number} publish_date
 *
 * @property {Array<BlogPostContent>} contents
 */

/**
 * @typedef BlogPostContent
 *
 * @property {number} id
 * @property {string} title
 * @property {string} subtitle
 * @property {string} content
 * @property {string} reading_length
 * @property {AttachmentFile} featured_image
 *
 * @property {number} locale_id
 * @property {Object} locale
 *
 * @property {number} post_id
 * @property {Object} post
 *
 * @property {string} seo_metadata_title
 * @property {string} seo_metadata_description
 * @property {string} seo_metadata_featured_image_id
 * @property {AttachmentFile | null} seo_metadata_featured_image
 * @property {boolean} seo_metadata_allow_indexing
 */
