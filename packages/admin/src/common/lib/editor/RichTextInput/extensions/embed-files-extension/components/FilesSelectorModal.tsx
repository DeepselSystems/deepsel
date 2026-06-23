import React, { useState } from 'react';
import type { Editor } from '@tiptap/core';
import { Button, Modal } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { IconFile, IconPlus, IconTrash } from '@tabler/icons-react';
import clsx from 'clsx';
import { MAX_FILES_COUNT } from '../utils';
import type { EmbedFileItem } from '../types';
import { ChooseAttachmentModal } from '../../../../../ui';
import type { AttachmentFile } from '../../../../../ui';
import type { User } from '../../../../../types';

interface FilesSelectorModalProps {
  editor: Editor | null;
  opened: boolean;
  setOpened: React.Dispatch<React.SetStateAction<boolean>>;
  selectedFiles: EmbedFileItem[];
  setSelectedFiles: React.Dispatch<React.SetStateAction<EmbedFileItem[]>>;
  isEditMode?: boolean;
  onUpdate?: (files: EmbedFileItem[]) => void;
  backendHost?: string;
  user?: User;
  setUser?: (user: User | null) => void;
  notify?: (meta: object) => void;
}

/**
 * Files selector modal
 *
 * @constructor
 */
const FilesSelectorModal = ({
  editor,
  opened,
  setOpened,
  selectedFiles,
  setSelectedFiles,
  isEditMode = false,
  onUpdate,
  backendHost,
  user,
  setUser,
  notify = () => {},
}: FilesSelectorModalProps) => {
  const { t } = useTranslation();

  const [isAttachmentModalOpened, setIsAttachmentModalOpened] = useState(false);

  /**
   * Filter attachments to exclude video, audio, and image files.
   * Reads from locale_versions[0].content_type because the parent
   * attachment.content_type is deprecated and null after the multilang refactor.
   * Falls back to attachment.content_type for legacy data that has not been migrated.
   */
  const filterFunc = (attachments: AttachmentFile[]) =>
    attachments.filter((attachment) => {
      const effectiveContentType = (
        attachment.locale_versions?.[0]?.content_type ??
        attachment.content_type ??
        ''
      ).toLowerCase();
      return (
        !effectiveContentType.startsWith('video') &&
        !effectiveContentType.startsWith('audio') &&
        !effectiveContentType.startsWith('image')
      );
    });

  /**
   * Insert or update files in the editor
   */
  const insertFiles = () => {
    if (selectedFiles.length === 0) {
      return;
    }

    if (isEditMode && onUpdate) {
      onUpdate(selectedFiles);
      return;
    }

    if (editor) {
      editor.chain().focus().setEmbedFiles({ files: selectedFiles }).run();

      setTimeout(() => {
        editor.chain().focus().createParagraphNear().run();
      }, 300);

      setSelectedFiles([]);
      setOpened(false);
    }
  };

  /**
   * Handle remove file from selection
   */
  const handleRemoveFile = (index: number) => {
    setSelectedFiles(selectedFiles.filter((_, i) => i !== index));
  };

  /**
   * Handle file selection from ChooseAttachmentModal.
   * Stores attachmentName (the attachment.name column) + displayName for editor label.
   */
  const handleFileSelect = (attachment: AttachmentFile) => {
    const attachmentName = attachment.name ?? '';

    if (selectedFiles.some((f) => f.attachmentName === attachmentName)) {
      notify({ type: 'warning', message: t('This file is already selected') });
      return;
    }

    if (selectedFiles.length >= MAX_FILES_COUNT) {
      notify({
        type: 'warning',
        message: t(`You can only select up to ${MAX_FILES_COUNT} files`),
      });
      return;
    }

    const displayName = attachmentName.split('/').pop() || attachmentName;

    setSelectedFiles([...selectedFiles, { attachmentName, displayName }]);
    setIsAttachmentModalOpened(false);
  };

  return (
    <>
      <Modal
        opened={opened}
        title={
          <div className="text-lg font-semibold">
            {isEditMode ? t('Edit files') : t('Select files')}
          </div>
        }
        onClose={() => setOpened(false)}
        size="xl"
        zIndex={11000}
      >
        <div className="space-y-4">
          {/* Selected files list */}
          {selectedFiles.length > 0 ? (
            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-700">
                {t('Selected files')} ({selectedFiles.length}/{MAX_FILES_COUNT})
              </div>
              {selectedFiles.map((file, index) => (
                <div
                  key={index}
                  className={clsx(
                    'flex items-center gap-3 p-3 bg-gray-50 rounded border border-gray-200',
                  )}
                >
                  <IconFile size={20} className="text-blue-500" />
                  <div className="flex-1 truncate" title={file.displayName}>
                    {file.displayName}
                  </div>
                  <button
                    onClick={() => handleRemoveFile(index)}
                    className="p-2 text-primary-main hover:bg-red-50 rounded transition"
                    title={t('Remove')}
                  >
                    <IconTrash size={16} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              {t('No files selected. Click "Add file" to select files.')}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 justify-between pt-4 border-t">
            <Button
              variant="outline"
              leftSection={<IconPlus size={16} />}
              onClick={() => setIsAttachmentModalOpened(true)}
              disabled={selectedFiles.length >= MAX_FILES_COUNT}
            >
              {t('Add file')}
            </Button>

            <div className="flex gap-2">
              <Button variant="subtle" onClick={() => setOpened(false)}>
                {t('Cancel')}
              </Button>
              <Button onClick={insertFiles} disabled={selectedFiles.length === 0}>
                {isEditMode ? t('Update') : t('Insert')}
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {backendHost && user && setUser ? (
        <ChooseAttachmentModal
          backendHost={backendHost}
          user={user}
          setUser={setUser}
          filters={[]}
          isOpen={isAttachmentModalOpened}
          close={() => setIsAttachmentModalOpened(false)}
          onChange={handleFileSelect}
          filterFunc={filterFunc}
        />
      ) : null}
    </>
  );
};

export default FilesSelectorModal;
