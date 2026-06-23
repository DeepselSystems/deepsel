import React from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { IconInfoCircle, IconDownload } from '@tabler/icons-react';
import dayjs from 'dayjs';
import {
  FORM_FIELD_TYPE as FormFieldType,
  formatFileSize,
  getAttachmentByNameRelativeUrl,
  type FormData,
  type FormField,
  type FormSubmissionFieldValue,
} from '@deepsel/cms-utils';
import type { UploadedFileRecord } from './FormFieldTypeRenderer.js';

/** A snapshot of a field merged with its submitted value — for internal use only */
interface SubmissionFieldSnapshot extends Record<string, unknown> {
  _submittedValue: unknown;
  _isDeleted: boolean;
}

export interface FormSubmissionViewerProps {
  formContent: FormData;
  submissionData: Record<number, FormSubmissionFieldValue>;
  /** Whether to render the form title and description (default: true) */
  showTitle?: boolean;
  /**
   * Optional renderer for file entries in Files fields.
   * When omitted a simple name + metadata row is shown.
   */
  renderFile?: (file: UploadedFileRecord, index: number) => React.ReactNode;
  className?: string;
}

/**
 * Read-only view of a submitted form response.
 * Pass `renderFile` to customise how uploaded files are displayed (e.g. to show image previews).
 */
export function FormSubmissionViewer({
  formContent,
  submissionData,
  showTitle = true,
  renderFile,
  className,
}: FormSubmissionViewerProps): React.ReactElement {
  const { t } = useTranslation();

  const submissionFields = React.useMemo<SubmissionFieldSnapshot[]>(() => {
    if (!submissionData) return [];
    const currentIds = new Set(formContent?.fields?.map((f) => f.id) ?? []);
    return Object.values(submissionData).map((fd) => ({
      ...(fd.field_snap_short as Record<string, unknown>),
      _submittedValue: fd.value,
      _isDeleted: !currentIds.has((fd.field_snap_short as { id?: number })?.id ?? -1),
    }));
  }, [submissionData, formContent?.fields]);

  if (!formContent) {
    return (
      <div className="py-8 form-submission-viewer--empty">
        <p className="form-submission-viewer__empty-message">{t('No form data available')}</p>
      </div>
    );
  }

  return (
    <div
      className={clsx(
        'container px-3 xl:px-6 mx-auto max-w-xl xl:max-w-2xl 2xl:max-w-3xl space-y-4',
        'form-submission-viewer',
        className,
      )}
    >
      {showTitle && (
        <div className="space-y-3 form-submission-viewer__title-section">
          <h2 className="break-words form-submission-viewer__title">{formContent.title}</h2>
          {formContent.description && (
            <p className="form-submission-viewer__description">{formContent.description}</p>
          )}
        </div>
      )}

      <div className="space-y-3 form-submission-viewer__field-list">
        {submissionFields.map((field, index) => (
          <div
            key={index}
            className="p-4 rounded-lg border flex flex-col gap-2 form-submission-viewer__field-item"
          >
            <p className="form-submission-viewer__field-label">
              {typeof field.label === 'string' ? field.label : ''}
              {Boolean(field.required) && (
                <span className="form-submission-viewer__field-required" aria-hidden="true">
                  {' *'}
                </span>
              )}
            </p>

            {Boolean(field.description) && (
              <p className="form-submission-viewer__field-description">
                {String(field.description)}
              </p>
            )}

            <div className="form-submission-viewer__field-value">
              <SubmittedValueDisplay
                field={field as unknown as FormField}
                value={field._submittedValue}
                renderFile={renderFile}
                locale={formContent.locale?.iso_code}
              />
            </div>

            {field._isDeleted && (
              <div
                role="alert"
                className="flex items-center gap-2 p-3 border rounded form-submission-viewer__deleted-warning"
              >
                <IconInfoCircle
                  size={16}
                  className="form-submission-viewer__deleted-warning-icon"
                />
                <p className="form-submission-viewer__deleted-warning-text">
                  {t('This field has been removed from the current form')}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      {formContent.closing_remarks && (
        <p className="form-submission-viewer__closing-remarks">{formContent.closing_remarks}</p>
      )}
    </div>
  );
}

interface SubmittedValueDisplayProps {
  field: FormField;
  value: unknown;
  renderFile?: (file: UploadedFileRecord, index: number) => React.ReactNode;
  locale?: string;
}

/** Renders the submitted value in the appropriate format for each field type */
function SubmittedValueDisplay({
  field,
  value,
  renderFile,
  locale,
}: SubmittedValueDisplayProps): React.ReactElement {
  const { t } = useTranslation();

  if (value === null || value === undefined || value === '') {
    return <p className="form-submission-viewer__empty-answer">{t('No answer provided')}</p>;
  }

  switch (field.field_type) {
    case FormFieldType.Checkboxes:
      if (Array.isArray(value) && value.length > 0) {
        return (
          <div className="flex flex-wrap gap-2 form-submission-viewer__option-badges">
            {value.map((item, i) => (
              <span key={i} className="form-submission-viewer__option-badge">
                {String(item)}
              </span>
            ))}
          </div>
        );
      }
      break;

    case FormFieldType.MultipleChoice:
    case FormFieldType.Dropdown:
      return <span className="form-submission-viewer__option-badge">{value as string}</span>;

    case FormFieldType.Date:
      return (
        <p className="form-submission-viewer__value">
          {dayjs(value as string).format('DD MMM YYYY')}
        </p>
      );

    case FormFieldType.Datetime:
      return (
        <p className="form-submission-viewer__value">
          {dayjs(value as string).format('DD MMM YYYY HH:mm')}
        </p>
      );

    case FormFieldType.Time:
      return (
        <p className="form-submission-viewer__value">
          {dayjs(value as string, 'HH:mm:ss').format('HH:mm')}
        </p>
      );

    case FormFieldType.Number:
      return (
        <p className="form-submission-viewer__value form-submission-viewer__value--number">
          {Number(value).toLocaleString()}
        </p>
      );

    case FormFieldType.Paragraph:
      return (
        <p className="break-words whitespace-pre-wrap form-submission-viewer__value form-submission-viewer__value--multiline">
          {value as string}
        </p>
      );

    case FormFieldType.Files:
      if (Array.isArray(value) && value.length > 0) {
        return (
          <div className="flex flex-col gap-4 form-submission-viewer__file-list">
            {(value as UploadedFileRecord[]).map((file, i) => {
              if (renderFile) return <React.Fragment key={i}>{renderFile(file, i)}</React.Fragment>;
              return <DefaultFileRow key={i} file={file} locale={locale} />;
            })}
          </div>
        );
      }
      break;

    default:
      return <p className="break-words form-submission-viewer__value">{value as string}</p>;
  }

  return <p className="form-submission-viewer__empty-answer">{t('No answer provided')}</p>;
}

/** Fallback file row when no renderFile prop is provided */
function DefaultFileRow({
  file,
  locale,
}: {
  file: UploadedFileRecord;
  locale?: string;
}): React.ReactElement {
  const contentType = file.contentType ?? file.content_type;
  const fileSize = file.filesize != null ? formatFileSize(file.filesize) : null;
  const downloadUrl = getAttachmentByNameRelativeUrl(String(file.name), locale);

  return (
    <div className="flex items-center justify-between gap-3 p-3 border rounded file-row">
      <div className="flex-1 min-w-0 file-row__info">
        <p className="truncate file-row__name">{String(file.name)}</p>
        <div className="flex items-center gap-2 file-row__meta">
          {contentType && <span className="file-row__meta-type">{contentType}</span>}
          {fileSize && (
            <>
              <span aria-hidden="true">•</span>
              <span className="file-row__meta-size">{fileSize}</span>
            </>
          )}
        </div>
      </div>
      <a
        href={downloadUrl}
        download
        target="_blank"
        rel="noreferrer"
        className="file-row__download-btn"
        aria-label="Download file"
      >
        <IconDownload size={18} />
      </a>
    </div>
  );
}
