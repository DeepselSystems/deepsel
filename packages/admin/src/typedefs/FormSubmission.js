/**
 * @typedef FormSubmission
 *
 * @property {number} id
 * @property {Record<number, FormSubmissionData>} submission_data - {[filedId]: <Object data of FormSubmissionData>}
 *
 * @property {number} form_id
 * @property {Form} form
 *
 * @property {FormContent} form_content
 *
 * @property {string} submitter_ip
 * @property {string} submitter_user_agent
 *
 * @property {string=} submitted_at - only available in submission_versions
 * @property {string=} timestamp - only available in submission_versions
 *
 * @property {Array<FormSubmission>} submission_versions
 */

/**
 * @typedef FormSubmissionData
 *
 * @property {number} field_id
 * @property {FormField} field_snap_short - Form field structure at creating moment
 * @property {string|number|Object|Date|Array|null} value
 *
 * @property {FormField} _field - internal value - do not submit
 * @property {string} _error - internal value - using to show validation error - do not submit
 */
