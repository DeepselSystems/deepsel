import type { SiteSettings } from '../types.js';

/** Runtime constant — use as `FORM_FIELD_TYPE.ShortAnswer` etc. */
export const FORM_FIELD_TYPE = {
  ShortAnswer: 'short_answer',
  Number: 'number',
  Paragraph: 'paragraph',
  MultipleChoice: 'multiple_choice',
  Checkboxes: 'checkboxes',
  Dropdown: 'dropdown',
  Date: 'date',
  Datetime: 'datetime',
  Time: 'time',
  Files: 'files',
} as const;

/** Union of all valid field type strings — derived from FORM_FIELD_TYPE */
export type FormFieldType = (typeof FORM_FIELD_TYPE)[keyof typeof FORM_FIELD_TYPE];

/** Time display format options for Time/Datetime fields */
export const TIME_FORMAT = {
  TWELVE_HOUR: '12h',
  TWENTY_FOUR_HOUR: '24h',
} as const;

export type TimeFormat = (typeof TIME_FORMAT)[keyof typeof TIME_FORMAT];

/** Select options for time format pickers */
export const TIME_FORMAT_OPTIONS: { value: TimeFormat; label: string }[] = [
  { value: TIME_FORMAT.TWELVE_HOUR, label: '12-hour (AM/PM)' },
  { value: TIME_FORMAT.TWENTY_FOUR_HOUR, label: '24-hour' },
];

/** Mirrors backend FormFieldConfig */
export interface FormFieldConfig {
  options?: string[];
  min_value?: number | null;
  max_value?: number | null;
  min_length?: number | null;
  max_length?: number | null;
  max_files?: number | null;
  allowed_file_types?: string[] | null;
  validation_pattern?: string | null;
  validation_message?: string | null;
}

/** A single form field as returned by GET /form/website/{lang}/{slug} */
export interface FormField {
  id: number;
  field_type: FormFieldType;
  label: string;
  description?: string | null;
  required: boolean;
  placeholder?: string | null;
  sort_order: number;
  field_config?: FormFieldConfig | null;
}

/** A previously submitted answer for one field, returned in latest_user_submission */
export interface FormSubmissionFieldValue {
  field_id: number;
  field_snap_short?: Record<string, unknown> | null;
  value: unknown;
}

/** A single form submission record returned by the statistics endpoint (PII stripped server-side) */
export interface FormSubmission {
  id: number;
  form_id: number;
  form_content_id: number;
  /** Map of field_id (as string key) → submission value object */
  submission_data: Record<string, FormSubmissionFieldValue>;
  created_at: string;
  updated_at: string;
}

/** Response shape of GET /form/website/{lang}/{slug}/statistics */
export interface FormStatisticsData extends FormData {
  submissions: FormSubmission[];
}

/** The full response shape of GET /form/website/{lang}/{slug} */
export interface FormData {
  /** form_content.id */
  id: number;
  form_id: number;
  title: string;
  slug: string;
  description?: string | null;
  closing_remarks?: string | null;
  success_message?: string | null;
  /** Language-specific custom code */
  custom_code?: string | null;
  /** All-language custom code on the parent form */
  form_custom_code?: string | null;
  lang?: string;
  locale_id: number;
  locale?: { iso_code: string; name?: string } | null;
  max_submissions?: number | null;
  show_remaining_submissions?: boolean | null;
  submissions_count: number;
  views_count: number;
  enable_public_statistics: boolean;
  latest_user_submission?: FormSubmissionFieldValue[] | null;
  fields: FormField[];
  /** Populated from fetchPublicSettings when the backend returns 404 */
  public_settings: SiteSettings;
  /** Set client-side when the backend returns 404 */
  notFound?: boolean;
}
