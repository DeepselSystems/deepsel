import { useCallback, useState } from 'react';
import {
  FORM_FIELD_TYPE as FormFieldType,
  type FormField,
  type FormSubmissionFieldValue,
} from '@deepsel/cms-utils';

/** Storage key for all form prefill data */
const FORM_PREFILL_STORAGE_KEY = 'form_prefill_data';

/** Storage structure: keyed by form slug, then by field id (as string) */
type PrefillStorage = Record<string, Record<string, Partial<FormSubmissionFieldValue>>>;

/**
 * Read and parse a value from localStorage.
 * Returns defaultValue if key is absent or JSON parsing fails.
 */
function readStorage<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') return defaultValue;
  try {
    const item = window.localStorage.getItem(key);
    return item !== null ? (JSON.parse(item) as T) : defaultValue;
  } catch {
    return defaultValue;
  }
}

/**
 * Serialize and write a value to localStorage.
 * Silently ignores write errors (e.g. private-mode quota).
 */
function writeStorage<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error('Failed to write to localStorage:', e);
  }
}

/**
 * Extract a locale-qualified form key from URL path.
 * Includes the locale prefix so different language versions of the same form
 * are stored under separate keys and do not overwrite each other.
 *
 * Examples:
 *   /en/forms/weekly-report  → en/forms/weekly-report
 *   /fr/forms/weekly-report  → fr/forms/weekly-report
 *   /forms/weekly-report     → forms/weekly-report  (no locale, legacy fallback)
 */
const extractFormSlugFromPath = (path: string): string | null => {
  // With locale prefix: /{locale}/forms/{slug}
  const withLocale = path.match(/\/([a-z]{2}(?:-[A-Z]{2})?)\/forms\/([^/?#]+)/);
  if (withLocale) return `${withLocale[1]}/forms/${withLocale[2]}`;

  // Without locale prefix: /forms/{slug}
  const withoutLocale = path.match(/\/forms\/([^/?#]+)/);
  return withoutLocale ? `forms/${withoutLocale[1]}` : null;
};

/**
 * Custom hook to manage form prefill data in localStorage.
 * Stores all form data in a single localStorage key with structure:
 * { [formSlug]: { [fieldId]: FormSubmissionFieldValue } }
 */
const useFormPrefill = () => {
  const [allFormsData, setAllFormsData] = useState<PrefillStorage>(() =>
    readStorage<PrefillStorage>(FORM_PREFILL_STORAGE_KEY, {}),
  );

  const updateStorage = useCallback((updater: (prev: PrefillStorage) => PrefillStorage) => {
    setAllFormsData((prev) => {
      const next = updater(prev);
      writeStorage(FORM_PREFILL_STORAGE_KEY, next);
      return next;
    });
  }, []);

  /**
   * Get prefill data for a specific form.
   * Validates that field IDs exist in the current form structure to handle form changes.
   *
   * @param formSlug - Slug identifying the form
   * @param fields - Current fields of the form used to validate saved field ids
   * @returns Filtered prefill data keyed by field id string
   */
  const getFormPrefillData = useCallback(
    (
      formSlug: string,
      fields: FormField[] = [],
    ): Record<string, Partial<FormSubmissionFieldValue>> => {
      if (!formSlug || !allFormsData[formSlug]) {
        return {};
      }

      const savedData = allFormsData[formSlug];
      const validFieldIds = new Set(fields.map((field) => String(field.id)));

      const validatedData: Record<string, Partial<FormSubmissionFieldValue>> = {};
      Object.keys(savedData).forEach((fieldId) => {
        if (validFieldIds.has(fieldId)) {
          validatedData[fieldId] = savedData[fieldId];
        }
      });

      return validatedData;
    },
    [allFormsData],
  );

  /**
   * Save form submission data to localStorage for future prefill.
   * Skips file fields and empty values.
   *
   * @param formSlug - Slug identifying the form
   * @param submissionData - Per-field submission data keyed by field id
   */
  const saveFormPrefillData = useCallback(
    (
      formSlug: string,
      submissionData: Record<string | number, Partial<FormSubmissionFieldValue>>,
    ): void => {
      if (!formSlug) return;

      const excludedTypes: string[] = [FormFieldType.Files];
      const dataToSave: Record<string, Partial<FormSubmissionFieldValue>> = {};

      Object.keys(submissionData).forEach((fieldId) => {
        const fieldData = submissionData[fieldId];
        if (!fieldData || !fieldData.value) return;

        const fieldType = (fieldData.field_snap_short as { field_type?: string } | null | undefined)
          ?.field_type;

        if (fieldType && excludedTypes.includes(fieldType)) return;

        if (typeof fieldData.value === 'string' && fieldData.value.trim() === '') return;

        if (Array.isArray(fieldData.value) && fieldData.value.length === 0) return;

        dataToSave[fieldId] = fieldData;
      });

      updateStorage((prev) => ({ ...prev, [formSlug]: dataToSave }));
    },
    [updateStorage],
  );

  /**
   * Clear prefill data for a specific form from localStorage.
   *
   * @param formSlug - Slug identifying the form to clear
   */
  const clearFormPrefillData = useCallback(
    (formSlug: string): void => {
      if (!formSlug) return;

      updateStorage((prev) => {
        const next = { ...prev };
        delete next[formSlug];
        return next;
      });
    },
    [updateStorage],
  );

  return {
    getFormPrefillData,
    saveFormPrefillData,
    clearFormPrefillData,
  };
};

/**
 * Get the current form slug from the browser's location pathname.
 * Returns null when called in a non-browser environment.
 *
 * @returns Form slug or null
 */
export const getCurrentFormSlug = (): string | null => {
  if (typeof window === 'undefined') return null;
  return extractFormSlugFromPath(window.location.pathname);
};

export default useFormPrefill;
