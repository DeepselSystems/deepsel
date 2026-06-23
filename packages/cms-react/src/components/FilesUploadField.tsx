import React, { useRef, useState, useCallback } from 'react';
import type { DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { formatFileSize, type FormField } from '@deepsel/cms-utils';
import type { UploadedFileRecord } from './FormFieldTypeRenderer.js';

/** Runtime config for a Files field */
interface FilesFieldConfig {
  max_files?: number | null;
  max_file_size?: number | null;
  allowed_file_types?: string | null;
}

/** Default upload size limit in MB when none is configured */
const DEFAULT_UPLOAD_SIZE_LIMIT_MB = 5;

export interface FilesUploadFieldProps {
  field: FormField;
  /**
   * Dual-type value:
   * - Deferred mode (no onUploadFiles): File[] — held locally until form submit
   * - Immediate mode (admin, onUploadFiles present): UploadedFileRecord[] — uploaded on drop
   */
  value?: File[] | UploadedFileRecord[];
  error?: string;
  onChange: (value: File[] | UploadedFileRecord[]) => void;
  /**
   * When provided: upload immediately on drop (admin/immediate mode).
   * When absent: store File[] in local state (public/deferred mode).
   */
  onUploadFiles?: (files: File[]) => Promise<UploadedFileRecord[]>;
  /** Only used in immediate mode to remove already-uploaded files */
  onDeleteAttachment?: (id: string | number) => Promise<void>;
  uploadSizeLimit?: number;
  className?: string;
}

/**
 * Pure HTML drag-and-drop file upload field.
 *
 * Operates in two modes:
 * - Immediate (admin): onUploadFiles injected → upload on drop, value = UploadedFileRecord[]
 * - Deferred (public form): no onUploadFiles → store File[] locally, upload happens on form submit
 */
export function FilesUploadField({
  field,
  value = [],
  error,
  onChange,
  onUploadFiles,
  onDeleteAttachment,
  uploadSizeLimit = DEFAULT_UPLOAD_SIZE_LIMIT_MB,
  className,
}: FilesUploadFieldProps): React.ReactElement {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const { label, description, required } = field;
  const fc = (field.field_config || {}) as FilesFieldConfig;

  const maxFiles = fc.max_files || 3;
  const maxFileSizeMB = fc.max_file_size || uploadSizeLimit;
  const maxFileSizeBytes = maxFileSizeMB * 1024 * 1024;
  const allowedTypes = fc.allowed_file_types || 'image/*';

  /** Validates and accepts new files — uploads immediately (admin) or stores locally (deferred). */
  const handleNewFiles = useCallback(
    async (files: File[]) => {
      const current = Array.isArray(value) ? value : [];
      setUploadError(null);

      if (current.length + files.length > maxFiles) {
        setUploadError(t('Maximum {{maxFiles}} files allowed', { maxFiles }));
        return;
      }

      const oversized = files.find((f) => f.size > maxFileSizeBytes);
      if (oversized) {
        setUploadError(t('File too large. Maximum size is {{maxFileSizeMB}}MB', { maxFileSizeMB }));
        return;
      }

      if (onUploadFiles) {
        // Immediate mode — upload now and store UploadedFileRecord[]
        setUploading(true);
        try {
          const uploaded = await onUploadFiles(files);
          const normalized = uploaded.map((f) => ({
            ...f,
            contentType: f.content_type ?? f.contentType,
            createdAt: f.created_at ?? f.createdAt,
          }));
          onChange([...(current as UploadedFileRecord[]), ...normalized]);
        } catch {
          setUploadError(t('File upload failed'));
        } finally {
          setUploading(false);
        }
      } else {
        // Deferred mode — store File[] locally
        onChange([...(current as File[]), ...files]);
      }
    },
    [value, maxFiles, maxFileSizeBytes, maxFileSizeMB, onUploadFiles, onChange, t],
  );

  /** Removes a file at the given index. Calls delete API only for already-uploaded records. */
  const handleRemoveFile = useCallback(
    async (index: number) => {
      const current = Array.isArray(value) ? value : [];
      const file = current[index];
      setDeleteLoading(true);
      try {
        // Only call delete API for already-uploaded records (immediate mode)
        if (!(file instanceof File) && file?.id && onDeleteAttachment) {
          await onDeleteAttachment(file.id);
        }
      } catch {
        // Still remove from UI on failure
      } finally {
        setDeleteLoading(false);
      }
      onChange(current.filter((_, i) => i !== index) as File[] | UploadedFileRecord[]);
    },
    [value, onDeleteAttachment, onChange],
  );

  /** Activates drag-active visual state while a file is dragged over the zone. */
  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  /** Clears drag-active state when the dragged file leaves the zone. */
  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  /** Handles file drop — extracts files from the drag event and passes them to handleNewFiles. */
  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) void handleNewFiles(files);
    },
    [handleNewFiles],
  );

  /** Handles file selection via the native file input dialog. */
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) void handleNewFiles(files);
      e.target.value = ''; // Reset so same file can be re-selected
    },
    [handleNewFiles],
  );

  /** Returns a display name for a file, regardless of whether it's a File or UploadedFileRecord. */
  const getFileName = (file: File | UploadedFileRecord): string => {
    if (file instanceof File) return file.name;
    if (file.name) return String(file.name);
    return t('Unknown file');
  };

  /** Returns a formatted metadata string (size, content type) for the file list preview. */
  const getFileMeta = (file: File | UploadedFileRecord): string => {
    if (file instanceof File) return formatFileSize(file.size);
    const parts: string[] = [];
    const contentType = (file.contentType ?? file.content_type) as string | undefined;
    if (contentType) parts.push(contentType);
    if (file.filesize != null) parts.push(formatFileSize(file.filesize));
    return parts.join(' • ');
  };

  const current = Array.isArray(value) ? value : [];
  const canAddMore = current.length < maxFiles;

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

      {canAddMore && (
        <div
          role="button"
          tabIndex={0}
          className={clsx('form-field__dropzone', {
            'form-field__dropzone--active': dragActive,
            'form-field__dropzone--loading': uploading,
          })}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          aria-label={t('Upload files')}
        >
          {/* Hidden native file input */}
          <input
            ref={inputRef}
            type="file"
            className="form-field__dropzone-input"
            multiple={maxFiles > 1}
            accept={allowedTypes === '*' ? undefined : allowedTypes}
            onChange={handleInputChange}
            aria-hidden="true"
            tabIndex={-1}
          />

          {/* Upload icon — inline SVG, zero deps */}
          <span className="form-field__dropzone-icon" aria-hidden="true">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </span>

          <div>
            <p className="form-field__dropzone-hint">{t('Drag files here or click to select')}</p>
            <p className="form-field__dropzone-meta">
              {t('Maximum {{maxFiles}} files, {{maxFileSizeMB}}MB each', {
                maxFiles,
                maxFileSizeMB,
              })}
            </p>
          </div>
        </div>
      )}

      {current.length > 0 && (
        <ul className="form-field__file-list">
          {current.map((file, index) => (
            <li
              key={file instanceof File ? `${file.name}-${index}` : String(file.id ?? index)}
              className="form-field__file-item"
            >
              <div className="form-field__file-info">
                {/* File icon — inline SVG */}
                <span className="form-field__file-icon" aria-hidden="true">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                    <polyline points="13 2 13 9 20 9" />
                  </svg>
                </span>
                <div>
                  <p className="form-field__file-name">{getFileName(file)}</p>
                  <p className="form-field__file-meta">{getFileMeta(file)}</p>
                </div>
              </div>
              <button
                type="button"
                disabled={deleteLoading || uploading}
                onClick={() => void handleRemoveFile(index)}
                className="form-field__file-remove"
                aria-label={t('Remove file')}
              >
                {/* X icon — inline SVG */}
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="form-field__file-count">
        {t('{{current}} of {{max}} files selected', { current: current.length, max: maxFiles })}
      </p>

      {(error || uploadError) && (
        <p className="form-field__error" role="alert">
          {error || uploadError}
        </p>
      )}
    </div>
  );
}
