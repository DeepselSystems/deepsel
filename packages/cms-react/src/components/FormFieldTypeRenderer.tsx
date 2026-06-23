import React from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { FORM_FIELD_TYPE as FormFieldType, type FormField } from '@deepsel/cms-utils';
import { FilesUploadField } from './FilesUploadField.js';

/** Default upload size limit in MB */
const DEFAULT_UPLOAD_SIZE_LIMIT_MB = 5;

/** Shape returned by the attachment upload API */
export interface UploadedFileRecord {
  id: string | number;
  name: string;
  content_type?: string | null;
  contentType?: string | null;
  filesize?: number | null;
  created_at?: string | null;
  createdAt?: string | null;
  [key: string]: unknown;
}

/** Option object used in MultipleChoice / Checkboxes / Dropdown fields */
interface OptionObj {
  id?: string;
  value: string;
  label: string;
}

/**
 * Runtime field_config — cast to this for safe property access.
 */
interface RuntimeFieldConfig {
  options?: OptionObj[];
  min_value?: number | string | null;
  max_value?: number | string | null;
  min_length?: number | null;
  max_length?: number | null;
  max_files?: number | null;
  max_file_size?: number | null;
  allowed_file_types?: string | null;
  validation_pattern?: string | null;
  validation_message?: string | null;
  time_format?: string | null;
  step?: number | null;
  precision?: number | null;
}

export interface FormFieldTypeRendererProps {
  field: FormField;
  value?: unknown;
  error?: string;
  onChange?: (value: unknown) => void;
  /** Inject to enable file uploads — required only for Files field type */
  onUploadFiles?: (files: File[]) => Promise<UploadedFileRecord[]>;
  /** Inject to enable file deletion — required only for Files field type */
  onDeleteAttachment?: (id: string | number) => Promise<void>;
  /** Max upload size in MB shown in file field hint (default: 5) */
  uploadSizeLimit?: number;
  className?: string;
}

/** Renders label, description, the field control, and error message */
function FieldWrapper({
  label,
  description,
  required,
  error,
  className,
  children,
}: {
  label: string;
  description?: string | null;
  required?: boolean;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={clsx('form-field', className)}>
      <label className="form-field__label">
        {label}
        {required && (
          <span className="form-field__required" aria-hidden="true">
            {' *'}
          </span>
        )}
      </label>
      {description && <p className="form-field__description">{description}</p>}
      {children}
      {error && (
        <p className="form-field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Renders the appropriate native HTML input for a given form field type.
 * Date/Time/Datetime use native browser inputs. File upload uses Dropzone.
 */
export function FormFieldTypeRenderer({
  field,
  value,
  error = '',
  onChange = () => {},
  onUploadFiles,
  onDeleteAttachment,
  uploadSizeLimit = DEFAULT_UPLOAD_SIZE_LIMIT_MB,
  className,
}: FormFieldTypeRendererProps): React.ReactElement {
  const { t } = useTranslation();
  const { field_type, label, description, placeholder, required } = field;
  const fc = (field.field_config || {}) as unknown as RuntimeFieldConfig;

  const wrapperProps = { label, description, required, error, className };

  switch (field_type) {
    case FormFieldType.ShortAnswer:
      return (
        <FieldWrapper {...wrapperProps}>
          <input
            type="text"
            className="form-field__control"
            placeholder={placeholder ?? undefined}
            required={required}
            maxLength={fc.max_length ?? undefined}
            minLength={fc.min_length ?? undefined}
            value={(value as string) || ''}
            onChange={({ target: { value: v } }) => onChange(v)}
          />
        </FieldWrapper>
      );

    case FormFieldType.Paragraph:
      return (
        <FieldWrapper {...wrapperProps}>
          <textarea
            className="form-field__control"
            placeholder={placeholder ?? undefined}
            required={required}
            maxLength={fc.max_length ?? undefined}
            minLength={fc.min_length ?? undefined}
            value={(value as string) || ''}
            onChange={({ target: { value: v } }) => onChange(v)}
            rows={3}
          />
        </FieldWrapper>
      );

    case FormFieldType.Number:
      return (
        <FieldWrapper {...wrapperProps}>
          <input
            type="number"
            className="form-field__control"
            placeholder={placeholder ?? undefined}
            required={required}
            min={fc.min_value != null ? Number(fc.min_value) : undefined}
            max={fc.max_value != null ? Number(fc.max_value) : undefined}
            step={fc.step || 1}
            value={(value as number) ?? ''}
            onChange={({ target: { value: v } }) => onChange(v === '' ? '' : Number(v))}
          />
        </FieldWrapper>
      );

    case FormFieldType.MultipleChoice:
      return (
        <FieldWrapper {...wrapperProps}>
          <div className="form-field__options">
            {(fc.options || []).map((option, index) => (
              <label key={option.id || index} className="form-field__option">
                <input
                  type="radio"
                  className="form-field__option-control"
                  name={`field_${field.id}`}
                  value={option.value}
                  checked={(value as string) === option.value}
                  onChange={() => onChange(option.value)}
                  required={required}
                />
                <span className="form-field__option-label">{option.label}</span>
              </label>
            ))}
          </div>
        </FieldWrapper>
      );

    case FormFieldType.Checkboxes:
      return (
        <FieldWrapper {...wrapperProps}>
          <div className="form-field__options">
            {(fc.options || []).map((option, index) => (
              <label key={option.id || index} className="form-field__option">
                <input
                  type="checkbox"
                  className="form-field__option-control"
                  value={option.value}
                  checked={((value as string[]) || []).includes(option.value)}
                  onChange={({ target: { checked } }) => {
                    const current = (value as string[]) || [];
                    onChange(
                      checked
                        ? [...current, option.value]
                        : current.filter((v) => v !== option.value),
                    );
                  }}
                />
                <span className="form-field__option-label">{option.label}</span>
              </label>
            ))}
          </div>
        </FieldWrapper>
      );

    case FormFieldType.Dropdown:
      return (
        <FieldWrapper {...wrapperProps}>
          <select
            className="form-field__control"
            required={required}
            value={(value as string) || ''}
            onChange={({ target: { value: v } }) => onChange(v)}
          >
            {!required && <option value="">—</option>}
            {(fc.options || []).map((option, index) => (
              <option key={option.id || index} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </FieldWrapper>
      );

    case FormFieldType.Date:
      return (
        <FieldWrapper {...wrapperProps}>
          <input
            type="date"
            className="form-field__control"
            required={required}
            min={fc.min_value != null ? String(fc.min_value) : undefined}
            max={fc.max_value != null ? String(fc.max_value) : undefined}
            value={
              value instanceof Date ? value.toISOString().split('T')[0] : (value as string) || ''
            }
            onChange={({ target: { value: v } }) => onChange(v)}
          />
        </FieldWrapper>
      );

    case FormFieldType.Time:
      return (
        <FieldWrapper {...wrapperProps}>
          <input
            type="time"
            className="form-field__control"
            required={required}
            /** step is in seconds for native time input; fc.step is in minutes */
            step={(fc.step || 15) * 60}
            min={fc.min_value != null ? String(fc.min_value) : undefined}
            max={fc.max_value != null ? String(fc.max_value) : undefined}
            value={(value as string) || ''}
            onChange={({ target: { value: v } }) => onChange(v)}
          />
        </FieldWrapper>
      );

    case FormFieldType.Datetime:
      return (
        <FieldWrapper {...wrapperProps}>
          <input
            type="datetime-local"
            className="form-field__control"
            required={required}
            min={fc.min_value != null ? String(fc.min_value) : undefined}
            max={fc.max_value != null ? String(fc.max_value) : undefined}
            value={
              value instanceof Date ? value.toISOString().slice(0, 16) : (value as string) || ''
            }
            onChange={({ target: { value: v } }) => onChange(v)}
          />
        </FieldWrapper>
      );

    case FormFieldType.Files:
      return (
        <FilesUploadField
          field={field}
          value={value as File[] | UploadedFileRecord[]}
          error={error}
          onChange={onChange}
          onUploadFiles={onUploadFiles}
          onDeleteAttachment={onDeleteAttachment}
          uploadSizeLimit={uploadSizeLimit}
          className={className}
        />
      );

    default:
      return (
        <p className={clsx('form-field--unsupported', className)}>
          {t('Unsupported field type: {{field_type}}', { field_type })}
        </p>
      );
  }
}
