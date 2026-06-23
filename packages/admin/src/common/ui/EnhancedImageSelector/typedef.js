/**
 * @typedef StockImage
 *
 * @property {string} provider
 * @property {string} title
 * @property {string} description
 * @property {number} width
 * @property {number} height
 * @property {string} preview_src
 * @property {string} src
 *
 * @property {string} _id - internal id
 * @property {AttachmentFile=} _attachment - attachment file (for cloned image case)
 */

/**
 * @typedef StockImageResults
 *
 * @property {boolean}
 * @property {string} message
 * @property {Array<StockImage>} data
 */
