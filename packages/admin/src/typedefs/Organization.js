/**
 * @typedef Organization
 *
 * @property {number} id
 * @property {string} name
 * @property {string} image_attachment_id
 * @property {string} operating_hours
 * @property {string} email
 * @property {string} phone
 * @property {string} website
 * @property {number} access_token_expire_minutes
 * @property {boolean} require_2fa_all_users
 * @property {boolean} allow_public_signup
 * @property {string} created_at
 * @property {string} updated_at
 * @property {boolean} system
 * @property {boolean} active
 * @property {boolean} is_technical
 * @property {string} street
 * @property {string} street2
 * @property {string} city
 * @property {string} state
 * @property {string} zip
 * @property {string} country
 * @property {null} image
 *
 * @property {string} openrouter_api_key
 * @property {string} openrouter_api_key_truncated
 *
 * @property {number|null} default_language_id
 * @property {OrgLanguage|null} default_language
 * @property {OrgLanguage[]} available_languages - Languages configured for this org's site
 */

/**
 * A locale/language entry as returned by the organization API.
 * Used in default_language and available_languages fields.
 * @typedef OrgLanguage
 * @property {number} id
 * @property {string} name        - e.g. "English / English"
 * @property {string} iso_code    - e.g. "en", "de", "zh_CN"
 */
