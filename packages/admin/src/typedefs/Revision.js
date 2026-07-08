/**
 * Nested user object on a revision record.
 * Matches UserNested from backend/apps/cms/schemas/_nested.py.
 *
 * @typedef RevisionOwner
 * @property {number} id
 * @property {string | null} username
 * @property {string | null} name
 * @property {string | null} email
 * @property {string | null} first_name
 * @property {string | null} last_name
 */

/**
 * Locale info nested inside ContentParentNested.
 * Matches LocaleNested from backend/apps/cms/schemas/_nested.py.
 *
 * @typedef RevisionLocale
 * @property {number} id
 * @property {string} name
 * @property {string} iso_code - BCP-47 language code, e.g. "en", "de"
 */

/**
 * Minimal parent content info embedded in revision records.
 * Provides organization and locale context for Jinja2 rendering (template_content/render).
 * Matches ContentParentNested from backend/apps/cms/schemas/_nested.py.
 *
 * @typedef ContentParentNested
 * @property {number} id
 * @property {number | null} organization_id
 * @property {RevisionLocale | null} locale
 */

/**
 * A single revision record returned by page_content_revision/search
 * or blog_post_content_revision/search.
 * Matches PageContentRevisionRead / BlogPostContentRevisionRead.
 *
 * @typedef ContentRevision
 * @property {number} id
 * @property {string | null} name - Human-readable label; set on publish, editable by user
 * @property {number | null} revision_number - Sequential per content row (1, 2, 3…)
 * @property {number | null} page_content_id - Set for page revisions
 * @property {number | null} blog_post_content_id - Set for blog revisions
 * @property {string | null} old_content - HTML before this publish
 * @property {string | null} new_content - HTML after this publish
 * @property {string | null} string_id
 * @property {string | null} created_at - ISO datetime string (UTC)
 * @property {string | null} updated_at - ISO datetime string (UTC)
 * @property {boolean} active
 * @property {boolean} system
 * @property {number | null} organization_id
 * @property {number | null} owner_id
 * @property {RevisionOwner | null} owner
 * @property {ContentParentNested | null} page_content - Populated for page revisions
 * @property {ContentParentNested | null} blog_post_content - Populated for blog revisions
 */

/**
 * Synthetic "current version" item injected at the top of the revision list.
 * Not a DB record — derived from the content record (page_content / blog_post_content).
 *
 * Currently represents the last *published* version (content.content + last_modified_at).
 * To switch to unsaved draft: use draft_content / draft_last_modified_at / draft_updated_by.
 *
 * page_content / blog_post_content are populated by buildParentNestedFields() in RevisionListPanel
 * so ContentPreviewPanel can extract lang/org for Jinja2 rendering the same way it does for
 * real ContentRevision records.
 *
 * @typedef CurrentVersionItem
 * @property {true} isCurrent - Discriminant flag; always true
 * @property {null} id - No DB id
 * @property {string | null} new_content - Current published HTML (content.content)
 * @property {string | null} created_at - last_modified_at of the content record (UTC)
 * @property {RevisionOwner | null} owner - updated_by of the content record
 * @property {null} name
 * @property {null} revision_number
 * @property {number | null} organization_id
 * @property {ContentParentNested | null} page_content - Populated for page content type
 * @property {ContentParentNested | null} blog_post_content - Populated for blog content type
 */
