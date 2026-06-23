import React, { useCallback, useEffect, useState } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { IconPencil, IconTrash, IconFileOff } from '@tabler/icons-react';
import { modals } from '@mantine/modals';
import { useTranslation } from 'react-i18next';
import { EMBED_FILES_ATTRIBUTES, EMBED_FILES_CLASSES } from '../utils';
import clsx from 'clsx';
import FilesSelectorModal from './FilesSelectorModal';
import { getAttachmentByNameRelativeUrl } from '@deepsel/cms-utils/common/utils';
import type { EmbedFileItem } from '../types';
import { useModel } from '../../../../../hooks';

/**
 * EditorNodeView component for embed files.
 * Displays the list of file references with edit/delete controls.
 * hrefs shown here are for editor preview only — the stored HTML uses Jinja syntax.
 */
const EditorNodeView = ({ node, editor, deleteNode, updateAttributes }: NodeViewProps) => {
  /**
   * backendHost, user, and setUser are sourced from PasteHandler.configure() options,
   * which are set in RichTextInput and provided by the consuming app.
   */
  const pasteHandlerExtension = editor.extensionManager.extensions.find(
    (ext) => ext.name === 'pasteHandler',
  );

  const { backendHost, user, setUser, locale } = pasteHandlerExtension?.options || {
    backendHost: '',
    user: null,
    setUser: () => {},
    locale: null,
  };

  const { t } = useTranslation();
  const { files } = node.attrs as { files: EmbedFileItem[] };
  const [localeVersions, setLocaleVersions] = useState<Array<AttachmentLocaleVersion>>([]);
  const { get: getAttachmentLocaleVersion } = useModel(
    'attachment_locale_version',
    { backendHost, user, setUser },
    {
      pageSize: null,
      autoFetch: false,
    },
  );

  const [isEditModalOpened, setIsEditModalOpened] = useState(false);
  const [editingFiles, setEditingFiles] = useState<EmbedFileItem[]>([]);

  /**
   * Handle edit button click - opens edit modal
   */
  const handleEditClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setEditingFiles([...files]);
      setIsEditModalOpened(true);
    },
    [files],
  );

  /**
   * Handle delete button click - removes the node
   */
  const handleDeleteClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (deleteNode) {
        modals.openConfirmModal({
          centered: true,
          title: <div className="text-lg font-semibold">{t('Delete Files')}</div>,
          children: t('Are you sure you want to delete these files?'),
          labels: { confirm: t('Delete'), cancel: t('Cancel') },
          onConfirm: deleteNode,
        });
      }
    },
    [deleteNode, t],
  );

  /**
   * Check if an attachment version is available for a given locale
   */
  const hasAttachmentVersionAvailable = useCallback(
    (attachmentName: string, localeISOCode: string) => {
      return localeVersions.some(
        (version) =>
          version.attachment.name === attachmentName && version.locale?.iso_code === localeISOCode,
      );
    },
    [localeVersions],
  );

  /**
   * Fetch attachment locale versions on mount
   */
  useEffect(() => {
    if (locale && files?.length > 0) {
      getAttachmentLocaleVersion({
        search: {
          OR: files.map((file) => ({
            field: 'attachment.name',
            operator: '=',
            value: file.attachmentName,
          })),
        },
      })
        .then((res) => {
          const localeVersions = (res?.data || []) as [] as Array<AttachmentLocaleVersion>;
          setLocaleVersions(localeVersions);
        })
        .catch((err) => {
          console.error(err);
          setLocaleVersions((prevState) => {
            prevState.length = 0;
            return prevState;
          });
        });
    }
  }, [locale, files?.length]);

  if (!files || files.length === 0) {
    return null;
  }

  return (
    <NodeViewWrapper
      className={clsx(EMBED_FILES_CLASSES.WRAPPER, 'relative group my-4')}
      {...{ [EMBED_FILES_ATTRIBUTES.CONTAINER]: 'true' }}
    >
      {/* Hover Overlay */}
      <div
        className={clsx(
          'absolute w-full h-full top-0 left-0',
          'bg-gray-emperor rounded transition opacity-0 group-hover:opacity-50',
        )}
      />

      {/* Action Buttons */}
      <div
        className={clsx(
          'transition opacity-0 group-hover:opacity-100',
          'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
          'flex gap-2',
        )}
      >
        <button
          onClick={handleEditClick}
          className={clsx(
            'group-hover:opacity-100 p-3 rounded bg-gray-ebony text-white bg-opacity-90 flex items-center justify-center',
            'shadow-lg transition-all duration-200 transform hover:scale-110',
          )}
          title={t('Edit Files')}
        >
          <IconPencil size={24} />
        </button>
        <button
          onClick={handleDeleteClick}
          className={clsx(
            'p-3 rounded bg-red-500 text-white bg-opacity-90',
            'flex items-center justify-center shadow-lg transition-all duration-200 transform hover:scale-110',
          )}
          title={t('Delete Files')}
        >
          <IconTrash size={24} />
        </button>
      </div>

      {/* Files Container — hrefs are editor-preview URLs only */}
      <div className={EMBED_FILES_CLASSES.FILES_CONTAINER}>
        {files.map((file, index) => {
          if (hasAttachmentVersionAvailable(file.attachmentName, locale)) {
            const previewUrl = getAttachmentByNameRelativeUrl(file.attachmentName, locale);
            return (
              <div key={index} className={clsx(EMBED_FILES_CLASSES.FILE_ITEM)}>
                <a
                  href={previewUrl}
                  download
                  className={EMBED_FILES_CLASSES.FILE_CONTENT}
                  title={file.displayName}
                >
                  <span className={EMBED_FILES_CLASSES.FILE_ICON}>📄</span>
                  <span className={EMBED_FILES_CLASSES.FILE_LINK}>{file.displayName}</span>
                </a>
              </div>
            );
          } else {
            return (
              <div className="my-1 py-2 px-4 rounded border border-dotted border-gray-400 text-gray-500 text-xs italic flex items-center gap-2">
                <IconFileOff size={16} className="shrink-0" />
                {t('File not available for locale')}
              </div>
            );
          }
        })}
      </div>

      {/* Edit Modal */}
      <FilesSelectorModal
        backendHost={backendHost}
        user={user}
        setUser={setUser}
        editor={null}
        opened={isEditModalOpened}
        setOpened={setIsEditModalOpened}
        selectedFiles={editingFiles}
        setSelectedFiles={setEditingFiles}
        isEditMode={true}
        onUpdate={(updatedFiles) => {
          if (updateAttributes) {
            updateAttributes({ files: updatedFiles });
          }
          setIsEditModalOpened(false);
        }}
      />
    </NodeViewWrapper>
  );
};

export default EditorNodeView;
