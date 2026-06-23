import React from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Skeleton } from '@mantine/core';
import { formatFileSize } from '@deepsel/cms-utils/common/utils';
import { insertAttachmentsToEditor } from '../utils';
import { useEffectOnce } from '../../../../../hooks';
import { useUpload } from '../../../../../hooks';

interface AttachmentFile {
  name: string;
  content_type: string;
}

/**
 * Locale-specific version of an attachment, as returned by the upload endpoint.
 * After the multilang refactor, content_type lives here rather than on the
 * parent AttachmentReadResponse.
 */
interface AttachmentLocaleVersion {
  content_type: string;
}

/**
 * Shape of the raw upload response from useUpload / uploadFileModel.
 * The parent model's content_type is null after the multilang refactor;
 * the real content_type is on locale_versions[0].
 */
interface AttachmentReadResponse {
  name: string;
  content_type: string | null;
  locale_versions: AttachmentLocaleVersion[];
}

/**
 * EditorNodeView component for paste handler
 * Displays pasted files with basic information
 */
const EditorNodeView = ({ node, editor, getPos }: NodeViewProps) => {
  const { t } = useTranslation();

  const files = (node.attrs.files as File[]) || [];

  const [hasUploaded, setHasUploaded] = React.useState(false);

  const pasteHandlerExtension = editor.extensionManager.extensions.find(
    (ext) => ext.name === 'pasteHandler',
  );

  /**
   * backendHost, token, organizationId, and notify are sourced from PasteHandler.configure() options,
   * which are set in RichTextInput and provided by the consuming app.
   */
  const { backendHost, token, organizationId, notify, currentLocaleId } =
    pasteHandlerExtension?.options || {
      backendHost: '',
      token: undefined,
      organizationId: undefined,
      notify: undefined,
      currentLocaleId: undefined,
    };

  const { uploadFileModel } = useUpload({ backendHost, token, organizationId });

  /**
   * Load basic file information
   */
  useEffectOnce(() => {
    notify({
      message: t('Uploading...'),
      type: 'info',
      duration: 100000,
    });
    uploadFileModel(
      'attachment',
      files,
      currentLocaleId != null ? { locale_id: currentLocaleId } : undefined,
    )
      .then((attachments) => {
        if (attachments && (attachments as AttachmentFile[]).length > 0 && editor && getPos) {
          const pos = getPos();
          editor
            .chain()
            .focus()
            .deleteRange({ from: pos, to: pos + node.nodeSize })
            .run();

          // Map raw upload responses to AttachmentFile, resolving content_type
          // from locale_versions[0] because the parent model's content_type is
          // null after the multilang refactor.
          const attachmentFiles: AttachmentFile[] = (
            attachments as unknown as AttachmentReadResponse[]
          ).map((att) => ({
            name: att.name,
            content_type: att.locale_versions?.[0]?.content_type ?? att.content_type ?? '',
          }));

          void insertAttachmentsToEditor(attachmentFiles, editor);

          notify({
            message: t('Uploaded successfully'),
            type: 'success',
            duration: 3000,
          });
        }
      })
      .catch((error: Error) => {
        console.error('Upload failed:', error);
        notify({
          message: t(error.message || 'Upload failed'),
          type: 'error',
          duration: 3000,
        });
      })
      .finally(() => {
        setHasUploaded(true);
      });
  });

  if (!files || files.length === 0) {
    return null;
  }

  return (
    <>
      {/* @ts-expect-error — @types/react v18 vs v19 mismatch via @tiptap/react peer dep */}
      <NodeViewWrapper className={clsx('paste-handler-wrapper')}>
        <div className="space-y-2">
          {!hasUploaded &&
            files.map((file, index) => (
              <div
                key={index}
                className={clsx(
                  'inline-flex gap-3 items-center border border-opacity-50 rounded px-2 py-1',
                )}
              >
                <div className="p-1 flex items-center">
                  <Skeleton width={50} height={60} />
                </div>
                <div>
                  <div className="max-w-36 truncate font-bold">{file.name}</div>
                  <div className="text-sm text-gray">{formatFileSize(file.size)}</div>
                  <div className="text-sm">{t('Uploading...')}</div>
                </div>
              </div>
            ))}
        </div>
      </NodeViewWrapper>
    </>
  );
};

export default EditorNodeView;
