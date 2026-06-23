/**
 * @typedef Form
 *
 * @property {number} id
 * @property {string} title
 * @property {boolean} published
 * @property {number} organization_id
 *
 * @property {Array<FormContent>} contents
 */

/**
 * @typedef FormContent
 *
 * @property {number} id
 * @property {string} title
 * @property {string} description
 * @property {string} slug
 * @property {string} closing_remarks
 * @property {string} success_message
 * @property {number} locale_id
 * @property {number} form_id
 * @property {number || null} max_submissions
 * @property {boolean} show_remaining_submissions
 * @property {number} submissions_count - the current number of submissions for this form content.
 * @property {number} views_count - the current number of views for this form content.
 *
 * @property {boolean} enable_edit_submission
 * @property {boolean} enable_submitter_email_notifications
 * @property {boolean} enable_admin_email_notifications
 * @property {Array<string>} notification_admin_emails
 *
 * @property {boolean} enable_public_statistics
 *
 * @property {Locale} locale
 * @property {Array<FormField>} fields
 *
 * @property {Array<FormSubmission>} submissions
 * @property {FormSubmission=} latest_user_submission
 */

/**
 * @typedef FormField
 *
 * @property {string} _id - internal id
 * @property {Object} _errors - validation errors
 *
 * @property {number} id
 * @property {string} label
 * @property {string} description
 * @property {string} placeholder
 * @property {string} field_type - @see: src/constants/form.js:1
 * @property {number} form_content_id
 * @property {number} sort_order
 * @property {boolean} required
 * @property {Partial<FormFieldConfig>} field_config - Field-specific configuration stored as JSON,  Contains: options, min_value, max_value, min_length, max_length, max_files,allowed_file_types, validation_pattern, validation_message, etc.
 */

/**
 * @typedef FormFieldConfig
 *
 * @property {string=} validation_message
 * @property {string=} allowed_file_types
 * @property {number=} max_file_size
 * @property {number=} max_files
 * @property {Array<{id: string, label: string, value: string}>=} options
 */
