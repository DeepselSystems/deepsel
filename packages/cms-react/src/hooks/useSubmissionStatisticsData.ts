import { useMemo } from 'react';
import type { FormField, FormSubmission, FormSubmissionFieldValue } from '@deepsel/cms-utils';

/**
 * Extracts per-field submission values from a submissions array.
 * Filters to only entries whose field_snap_short.field_type matches the given field.
 */
export function useSubmissionStatisticsData(
  formField: FormField,
  formSubmissions: FormSubmission[],
): { fieldSubmissions: FormSubmissionFieldValue[] } {
  const fieldSubmissions = useMemo(() => {
    const result: FormSubmissionFieldValue[] = [];
    for (const submission of formSubmissions) {
      const entry = submission.submission_data[String(formField.id)];
      if (entry && entry.field_snap_short?.['field_type'] === formField.field_type) {
        result.push(entry);
      }
    }
    return result;
  }, [formField.id, formField.field_type, formSubmissions]);

  return { fieldSubmissions };
}
