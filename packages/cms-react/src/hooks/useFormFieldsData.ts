import { useCallback, useState } from 'react';
import type { FormSubmissionFieldValue } from '@deepsel/cms-utils';

/** Per-field submission data keyed by field id */
export type FormFieldsData = Record<number, Partial<FormSubmissionFieldValue>>;

/**
 * Manages per-field submission data for a rendered form.
 * Generic so consumers can extend the value type with internal UI fields (e.g. _error, _field).
 * @param initFormFieldsData - Optional initial field values keyed by field id
 */
export function useFormFieldsData<T = Partial<FormSubmissionFieldValue>>(
  initFormFieldsData: Record<number, T> = {},
) {
  const [formFieldsData, setFormFieldsData] = useState<Record<number, T>>(initFormFieldsData);

  const setFieldData = useCallback((fieldId: number, data: Partial<T>) => {
    setFormFieldsData((prev) => ({
      ...prev,
      [fieldId]: { ...(prev[fieldId] || {}), ...((data as object) || {}) } as T,
    }));
  }, []);

  return { formFieldsData, setFormFieldsData, setFieldData };
}
