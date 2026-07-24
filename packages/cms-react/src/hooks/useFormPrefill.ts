import { useCallback, useMemo, useState } from 'react';
import {
  FORM_FIELD_TYPE as FormFieldType,
  type FormField,
  type FormSubmissionFieldValue,
} from '@deepsel/cms-utils';

/** Storage key for all form prefill data */
const FORM_PREFILL_STORAGE_KEY = 'form_prefill_data';

/**
 * Scope key for anonymous/public visitors — a single shared bucket, since there is
 * no stable identity to namespace by. Guaranteed to never collide with a form slug
 * (form slugs always contain '/forms/', see extractFormSlugFromPath) or a
 * `user:`-prefixed scope key.
 */
const ANONYMOUS_SCOPE_KEY = 'anon';

/** Prefix for a per-user scope key, e.g. `user:42` */
const USER_SCOPE_PREFIX = 'user:';

/** Storage structure: keyed by viewer scope, then form slug, then field id (as string) */
type PrefillStorage = Record<
  string,
  Record<string, Record<string, Partial<FormSubmissionFieldValue>>>
>;

/** Legacy (pre-viewer-scoping) storage structure: form slug directly at the top level */
type LegacyPrefillStorage = Record<string, Record<string, Partial<FormSubmissionFieldValue>>>;

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
 * Build the localStorage scope key for a viewer.
 * Authenticated viewers get a dedicated `user:<id>` bucket so their prefilled
 * answers never leak to a different user (or an anonymous visitor) sharing the
 * same browser. Anonymous/public visitors share the ANONYMOUS_SCOPE_KEY bucket.
 */
function getViewerScopeKey(viewerId?: string | null): string {
  return viewerId ? `${USER_SCOPE_PREFIX}${viewerId}` : ANONYMOUS_SCOPE_KEY;
}

/**
 * Detect legacy flat-shape prefill data (form slug directly at the top level,
 * from before per-viewer scoping existed). That shape was a single bucket
 * shared by every visitor regardless of auth state, so entries could belong
 * to a previously logged-in user — there's no way to recover whose answers
 * they were, so callers discard rather than migrate this data. Detection
 * relies on the fact that form slugs always contain '/forms/' (see
 * extractFormSlugFromPath), so they can never collide with
 * ANONYMOUS_SCOPE_KEY or a `user:`-prefixed key.
 */
function isLegacyPrefillShape(raw: PrefillStorage | LegacyPrefillStorage): boolean {
  const topLevelKeys = Object.keys(raw);
  return (
    topLevelKeys.length > 0 &&
    topLevelKeys.every((key) => key !== ANONYMOUS_SCOPE_KEY && !key.startsWith(USER_SCOPE_PREFIX))
  );
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
 * { [viewerScope]: { [formSlug]: { [fieldId]: FormSubmissionFieldValue } } }
 *
 * @param viewerId - Stable identifier of the authenticated viewer (e.g. `FormData.viewer_id`),
 *   or null/undefined for anonymous/public visitors. Scopes prefill data per viewer so
 *   different users (or an anonymous visitor) sharing the same browser never see each
 *   other's previously-submitted answers.
 */
const useFormPrefill = (viewerId?: string | null) => {
  const [allFormsData, setAllFormsData] = useState<PrefillStorage>(() => {
    const raw = readStorage<PrefillStorage | LegacyPrefillStorage>(FORM_PREFILL_STORAGE_KEY, {});
    if (isLegacyPrefillShape(raw)) {
      // Discard rather than migrate — see isLegacyPrefillShape's docstring.
      writeStorage(FORM_PREFILL_STORAGE_KEY, {});
      return {};
    }
    return raw as PrefillStorage;
  });

  const scopeKey = useMemo(() => getViewerScopeKey(viewerId), [viewerId]);

  const updateStorage = useCallback((updater: (prev: PrefillStorage) => PrefillStorage) => {
    setAllFormsData((prev) => {
      const next = updater(prev);
      writeStorage(FORM_PREFILL_STORAGE_KEY, next);
      return next;
    });
  }, []);

  /**
   * Get prefill data for a specific form within the current viewer scope.
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
      const savedData = allFormsData[scopeKey]?.[formSlug];
      if (!formSlug || !savedData) {
        return {};
      }

      const validFieldIds = new Set(fields.map((field) => String(field.id)));

      const validatedData: Record<string, Partial<FormSubmissionFieldValue>> = {};
      Object.keys(savedData).forEach((fieldId) => {
        if (validFieldIds.has(fieldId)) {
          validatedData[fieldId] = savedData[fieldId];
        }
      });

      return validatedData;
    },
    [allFormsData, scopeKey],
  );

  /**
   * Save form submission data to localStorage, under the current viewer scope,
   * for future prefill. Skips file fields and empty values.
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

      updateStorage((prev) => ({
        ...prev,
        [scopeKey]: {
          ...prev[scopeKey],
          [formSlug]: dataToSave,
        },
      }));
    },
    [updateStorage, scopeKey],
  );

  /**
   * Clear prefill data for a specific form, within the current viewer scope only,
   * from localStorage. Other scopes and other forms are left untouched.
   *
   * @param formSlug - Slug identifying the form to clear
   */
  const clearFormPrefillData = useCallback(
    (formSlug: string): void => {
      if (!formSlug) return;

      updateStorage((prev) => {
        const scopedForms = { ...prev[scopeKey] };
        delete scopedForms[formSlug];
        return { ...prev, [scopeKey]: scopedForms };
      });
    },
    [updateStorage, scopeKey],
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
