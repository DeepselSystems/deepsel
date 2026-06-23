import React, { useCallback, useRef } from 'react';
import { IconCheck, IconUpload } from '@tabler/icons-react';
import { useFetch } from './useFetch';
import type { User } from '../types';
import type { NotifyFn } from '../types';
import type { AttachmentFile } from '../ui';
import BackendHostURLState from '../../stores/BackendHostURLState';

/** Shape of the batch_upsert endpoint response */
interface BatchUpsertResult {
  attachment: AttachmentFile;
  has_errors: boolean;
}

interface UseAttachmentCardOverlayOptions {
  /** Parent attachment object */
  attachment: AttachmentFile;
  /** Currently selected locale ID — null disables the upload action */
  selectedLocaleId: number | null;
  /** Display name of the selected language — used in button labels */
  selectedLangName: string | null;
  /** setUser from UserState — forwarded to useFetch for 401 handling */
  setUser: (user: User | null) => void;
  /** Optional notification callback */
  notify?: NotifyFn;
  /** Called with the updated attachment and the locale ID that was just uploaded */
  onVersionUploaded: (attachment: AttachmentFile, localeId: number) => void;
  /** Translation function from useTranslation() */
  t: (key: string, options?: Record<string, unknown>) => string;
  /**
   * When provided, shows a "Select" button overlay when a file exists for the selected locale.
   * Omit to suppress the select overlay (e.g. ChooseAttachmentModal handles clicks itself).
   */
  onSelect?: (id: number | string) => void;
  /** Suppresses the select overlay while in edit/delete mode */
  isEditMode?: boolean;
  /** Hides the select action */
  hideSelectAction?: boolean;
}

interface UseAttachmentCardOverlayReturn {
  /**
   * Overlay React node to pass as the `overlay` prop to AttachmentPreview.
   * Shows "Upload for {lang}" when no file exists, "Select" when a file exists.
   * Undefined when no action applies.
   */
  overlay: React.ReactNode | undefined;
  /** Hidden <input type="file"> — must be rendered somewhere in the component tree */
  fileInputElement: React.ReactNode;
}

/**
 * Produces the correct hover overlay for an attachment card:
 * - "Upload for {lang}" when no file exists for the selected locale
 * - "Select" when a file exists (only when onSelect is provided and not in edit mode)
 *
 * Also manages the hidden file input and multipart upload logic.
 */
export function useAttachmentCardOverlay({
  attachment,
  selectedLocaleId,
  selectedLangName,
  setUser,
  notify,
  onVersionUploaded,
  t,
  onSelect,
  isEditMode = false,
  hideSelectAction = false,
}: UseAttachmentCardOverlayOptions): UseAttachmentCardOverlayReturn {
  const attachmentId = attachment.id;
  const hasAttachmentVersion = attachment.locale_versions?.some(
    (v) => v.locale_id === selectedLocaleId,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { backendHost } = BackendHostURLState();

  const { post: batchUpsert } = useFetch<never, BatchUpsertResult>('attachment', {
    backendHost,
    setUser,
  });

  const handleUpload = useCallback(
    async (file: File, localeId: number) => {
      const ext = file.name.includes('.') ? '.' + file.name.split('.').pop()! : '';
      const renamedFile = new File([file], `upload${ext}`, { type: file.type });
      const formData = new FormData();
      formData.append(
        'items_json',
        JSON.stringify([
          {
            locale_id: localeId,
            attachment_locale_version_id: null,
            _file_id: 'upload',
            name: file.name.replace(/\.[^/.]+$/, ''),
          },
        ]),
      );
      formData.append('files', renamedFile);
      try {
        const result = await batchUpsert(formData, {
          path: `attachment/${attachmentId}/locale_versions/batch_upsert`,
        });
        if (result?.attachment) {
          onVersionUploaded(result.attachment, localeId);
        }
        notify?.({ message: t('Uploaded successfully'), type: 'success' });
      } catch (err) {
        notify?.({ message: (err as Error).message, type: 'error' });
        console.error(err);
      }
    },
    [attachmentId, batchUpsert, notify, onVersionUploaded, t],
  );

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const picked = e.target.files?.[0];
      if (!picked || selectedLocaleId == null) return;
      e.target.value = '';
      void handleUpload(picked, selectedLocaleId);
    },
    [handleUpload, selectedLocaleId],
  );

  const showUploadAction =
    selectedLocaleId != null && selectedLangName != null && !hasAttachmentVersion;

  const showSelectAction = onSelect != null && !isEditMode && !showUploadAction;

  const overlay = showUploadAction ? (
    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
      <button
        type="button"
        className="flex flex-col items-center gap-1.5 text-white text-xs font-medium px-3 py-2 rounded bg-black/40 hover:bg-black/60 transition-colors cursor-pointer"
        onClick={(e) => {
          e.stopPropagation();
          fileInputRef.current?.click();
        }}
      >
        <IconUpload size={20} />
        <span>{t('Upload for {{lang}}', { lang: selectedLangName })}</span>
      </button>
    </div>
  ) : showSelectAction && !hideSelectAction ? (
    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
      <button
        type="button"
        className="flex flex-col items-center gap-1.5 text-white text-xs font-medium px-3 py-2 rounded bg-black/40 hover:bg-black/60 transition-colors cursor-pointer"
        onClick={(e) => {
          e.stopPropagation();
          onSelect(attachment.id);
        }}
      >
        <IconCheck size={20} />
        <span>{t('Select')}</span>
      </button>
    </div>
  ) : undefined;

  const fileInputElement = (
    <input
      ref={fileInputRef}
      type="file"
      className="hidden"
      onChange={handleFileInputChange}
      onClick={(e) => e.stopPropagation()}
    />
  );

  return { overlay, fileInputElement };
}
