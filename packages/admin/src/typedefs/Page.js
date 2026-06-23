/**
 * @typedef Page
 *
 * @property {id} name
 * @property {string} contents
 * @property {boolean} published
 * @property {string} is_homepage
 */

/**
 * @typedef PageContent
 *
 * @property {number} id
 * @property {string} title
 * @property {string} content
 * @property {string} slug
 *
 * @property {number} locale_id
 *
 * @property {number} page_id
 * @property {Page} page
 *
 * @property {string} seo_metadata_title
 * @property {string} seo_metadata_description
 * @property {string} seo_metadata_featured_image_id
 * @property {AttachmentFile | null} seo_metadata_featured_image
 * @property {boolean} seo_metadata_allow_indexing
 */
