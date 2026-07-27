import React, { useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import {
  FORM_FIELD_TYPE as FormFieldType,
  type FormData,
  type FormField,
  type FormSubmissionFieldValue,
} from '@deepsel/cms-utils';
import { FormFieldTypeRenderer, type UploadedFileRecord } from './FormFieldTypeRenderer.js';
import { useFormFieldsData } from '../hooks/useFormFieldsData.js';
import useFormPrefill from '../hooks/useFormPrefill.js';

/** Per-field state with internal UI tracking keys stripped before submission */
interface InternalFieldData extends Partial<FormSubmissionFieldValue> {
  _field?: FormField;
  _error?: string;
}

/** Shape received by the RenderedForm onSubmit callback */
export type FormSubmitData = Record<number, Record<string, unknown>>;

export interface FormRendererProps {
  formContent: FormData;
  /** May return a Promise — prefill is saved only after the Promise resolves */
  onSubmit?: (data: FormSubmitData) => Promise<void> | void;
  loading?: boolean;
  submitted?: boolean;
  initialFieldsData?: Record<number, Partial<FormSubmissionFieldValue>>;
  /**
   * When true, form data is read from and saved to localStorage for prefill on next visit.
   * Prefill is only saved after a successful submission (resolved Promise or synchronous return).
   * `initialFieldsData` takes priority over localStorage when provided.
   * @default false
   */
  enablePrefill?: boolean;
  /** Upload handler — required only when the form has a Files field */
  onUploadFiles?: (files: File[]) => Promise<UploadedFileRecord[]>;
  /** Delete handler — required only when the form has a Files field */
  onDeleteAttachment?: (id: string | number) => Promise<void>;
  /** Max upload size in MB shown in file field hint (default: 5) */
  uploadSizeLimit?: number;
  className?: string;
}

/**
 * Renders only the interactive fields and submit button of a Deepsel CMS form.
 * Informational content (title, description, closing remarks, success message) is
 * intentionally omitted — render those in the consuming theme component.
 * Pass `onUploadFiles` / `onDeleteAttachment` / `uploadSizeLimit` when the form has a Files field.
 */
export const FormRenderer = ({
  formContent,
  onSubmit = () => {},
  loading = false,
  submitted = false,
  initialFieldsData = {},
  enablePrefill = false,
  onUploadFiles,
  onDeleteAttachment,
  uploadSizeLimit,
  className,
}: FormRendererProps) => {
  const { t } = useTranslation();

  const fields = useMemo(() => formContent.fields || [], [formContent.fields]);

  /** Remaining submissions, or null when unlimited */
  const submissionsRemaining = useMemo(() => {
    const max = formContent.max_submissions;
    if (max === null || max === undefined) return null;
    return Math.max(0, Number(max) - (formContent.submissions_count || 0));
  }, [formContent.max_submissions, formContent.submissions_count]);

  const reachedSubmissionLimit = submissionsRemaining === 0;

  const initialData: Record<number, InternalFieldData> = Object.fromEntries(
    fields.map((field) => [
      field.id,
      {
        field_id: field.id,
        field_snap_short: field as unknown as Record<string, unknown>,
        value: null,
        _field: field,
        _error: '',
      },
    ]),
  );

  const { formFieldsData, setFieldData, setFormFieldsData } =
    useFormFieldsData<InternalFieldData>(initialData);

  const { getFormPrefillData, saveFormPrefillData } = useFormPrefill(formContent.viewer_id);

  /** Prefill key = current pathname (no domain, no query params). Unique per locale + slug. */
  const prefillKey =
    typeof window !== 'undefined' ? window.location.pathname : (formContent.slug ?? null);

  /**
   * Validate the form.
   * Returns true if the form is valid, false otherwise.
   */
  const validate = useCallback(() => {
    let valid = true;
    Object.keys(formFieldsData).forEach((key) => {
      const id = Number(key);
      const fd = formFieldsData[id];
      setFieldData(id, { _error: '' });

      if (!fd?._field?.required) return;

      let isEmpty: boolean;
      switch (fd._field.field_type) {
        case FormFieldType.Files:
          isEmpty = !fd.value || !Array.isArray(fd.value) || (fd.value as unknown[]).length === 0;
          break;
        case FormFieldType.Checkboxes:
          isEmpty = !Array.isArray(fd.value) || (fd.value as unknown[]).length === 0;
          break;
        default:
          isEmpty = !fd.value;
      }

      if (isEmpty) {
        valid = false;
        const validationMsg = (fd._field.field_config as Record<string, unknown> | null | undefined)
          ?.validation_message as string | undefined;
        setFieldData(id, {
          _error: validationMsg || t('Can not be empty for this field'),
        });
      }
    });
    return valid;
  }, [formFieldsData, setFieldData, t]);

  /**
   * Handle form submission.
   * Validates the form and saves prefill data if enabled.
   */
  const handleSubmit = useCallback(() => {
    if (!validate()) return;

    const submitData = formFieldsData as unknown as FormSubmitData;
    const result = onSubmit(submitData);

    if (result instanceof Promise) {
      result
        .then(() => {
          if (enablePrefill && prefillKey) {
            saveFormPrefillData(prefillKey, submitData);
          }
        })
        .catch(() => {});
    } else {
      if (enablePrefill && prefillKey) {
        saveFormPrefillData(prefillKey, submitData);
      }
    }
  }, [enablePrefill, prefillKey, formFieldsData, onSubmit, saveFormPrefillData, validate]);

  /**
   * Set form fields data from localStorage on mount.
   * This is a one-time effect to ensure the form is pre-filled with saved data.
   */
  useEffect(() => {
    if (!enablePrefill || !prefillKey) return;
    const prefillData = getFormPrefillData(prefillKey, fields);
    if (Object.keys(prefillData).length === 0) return;

    setFormFieldsData((prev) => ({
      ...prev,
      ...Object.fromEntries(
        fields
          .filter((field) => !!prev[field.id])
          .map((field) => [
            field.id,
            {
              ...prev[field.id],
              value: prev[field.id]?.value || prefillData[String(field.id)]?.value,
            },
          ]),
      ),
    }));
  }, []);

  useEffect(() => {
    if (Object.keys(initialFieldsData).length === 0) return;

    const getInitValue = (field: FormField) => {
      const init = initialFieldsData[field.id];
      if (!init) return null;
      const snap = init.field_snap_short;
      return snap?.field_type === field.field_type ? init.value : null;
    };

    setFormFieldsData((prev) => ({
      ...prev,
      ...Object.fromEntries(
        fields
          .filter((field) => !!prev[field.id])
          .map((field) => [
            field.id,
            {
              ...prev[field.id],
              value: prev[field.id]?.value || getInitValue(field),
            },
          ]),
      ),
    }));
  }, [fields, initialFieldsData, setFormFieldsData]);

  return (
    <div className={clsx('form-renderer', className)}>
      <form
        className={clsx('form-renderer__form', {
          'pointer-events-none': submitted || reachedSubmissionLimit,
        })}
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
      >
        {fields.map((field, index) => (
          <div key={index} className="form-renderer__field-item">
            <FormFieldTypeRenderer
              field={field}
              value={formFieldsData[field.id]?.value}
              onChange={(v) => setFieldData(field.id, { value: v })}
              error={formFieldsData[field.id]?._error}
              onUploadFiles={onUploadFiles}
              onDeleteAttachment={onDeleteAttachment}
              uploadSizeLimit={uploadSizeLimit}
            />
          </div>
        ))}

        {!submitted && (
          <div className="form-renderer__submit-wrapper">
            <button
              type="submit"
              disabled={loading || submitted || reachedSubmissionLimit}
              className={clsx('form-renderer__submit-button', {
                'form-renderer__submit-button--loading': loading,
              })}
            >
              {t('Submit')}
            </button>
          </div>
        )}
      </form>
    </div>
  );
};
