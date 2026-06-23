/**
 * @typedef LocaleInfo
 * @property {number} id
 * @property {string} name        - e.g. "English (US)"
 * @property {string} iso_code    - e.g. "en", "de", "zh_CN"
 * @property {string|null} emoji_flag
 */

/**
 * @typedef AttachmentLocaleVersion
 * @property {number} id
 * @property {string} name          - Storage key / SEO-friendly filename used in serve URL
 * @property {string|null} type     - Storage backend type (e.g. "local", "s3", "azure")
 * @property {string|null} content_type
 * @property {number|null} filesize - Size in bytes
 * @property {string|null} alt_text
 * @property {number} attachment_id
 * @property {AttachmentFile} attachment
 * @property {number} locale_id
 * @property {LocaleInfo|null} locale
 * @property {number|null} organization_id
 * @property {number|null} owner_id
 * @property {string|null} string_id
 * @property {string|null} created_at
 * @property {string|null} updated_at
 * @property {boolean} active
 * @property {boolean} system
 */

/**
 * @typedef AttachmentFile
 * @property {number} id
 * @property {string|null} name            - Deprecated; use locale_versions[*].name instead
 * @property {string|null} type            - Deprecated
 * @property {string|null} content_type    - Deprecated
 * @property {number|null} filesize        - Deprecated
 * @property {string|null} alt_text        - Deprecated
 * @property {number|null} organization_id
 * @property {number|null} owner_id
 * @property {string|null} string_id
 * @property {string|null} created_at
 * @property {string|null} updated_at
 * @property {boolean} active
 * @property {boolean} system
 * @property {AttachmentLocaleVersion[]} locale_versions
 */
