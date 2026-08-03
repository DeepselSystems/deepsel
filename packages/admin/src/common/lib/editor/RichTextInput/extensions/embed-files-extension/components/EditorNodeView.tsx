import React, { useCallback, useEffect, useState } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { IconPencil, IconTrash } from '@tabler/icons-react';
import { modals } from '@mantine/modals';
import { useTranslation } from 'react-i18next';
import {
  EMBED_FILES_ATTRIBUTES,
  EMBED_FILES_CLASSES,
  getEmbedFilesOptions,
  resolveLocaleVersionDisplayName,
} from '../utils';
import clsx from 'clsx';
import FilesSelectorModal from './FilesSelectorModal';
import { getAttachmentByNameRelativeUrl } from '@deepsel/cms-utils/common/utils';
import type { EmbedFileItem } from '../types';
import { useFetch } from '../../../../../hooks';
import type { AttachmentFile } from '../../../../../ui';

/**
 * EditorNodeView component for embed files.
 * Displays the list of file references with edit/delete controls.
 * hrefs shown here are for editor preview only — the stored HTML uses Jinja syntax.
 */
const EditorNodeView = ({ node, editor, deleteNode, updateAttributes }: NodeViewProps) => {
  /**
   * backendHost, user, setUser, and locale are sourced from EmbedFiles.configure() options,
   * which are set in RichTextInput and provided by the consuming app.
   * (PasteHandler's options only expose a JWT `token`, not the full `user`/`setUser`.)
   */
  const { backendHost = '', user, setUser = () => {}, locale } = getEmbedFilesOptions(editor);

  const { t } = useTranslation();
  const { files } = node.attrs as { files: EmbedFileItem[] };

  const [isEditModalOpened, setIsEditModalOpened] = useState(false);
  const [editingFiles, setEditingFiles] = useState<EmbedFileItem[]>([]);

  /**
   * Names shown in `files` come straight from the saved Jinja content, which only
   * stores the attachment's internal name — not the locale-specific SEO name. This
   * batch-resolves the real per-locale name (attachment_locale_version.name) for
   * the current editor locale, same as the backend does at render time.
   */
  const { post: searchAttachments } = useFetch<never, { total: number; data: AttachmentFile[] }>(
    'attachment',
    { backendHost, setUser },
  );
  const [resolvedNames, setResolvedNames] = useState<Record<string, string>>({});
  const attachmentNamesKey = files?.map((f) => f.attachmentName).join(',') ?? '';

  useEffect(() => {
    if (!locale || !attachmentNamesKey) return;
    let cancelled = false;

    void searchAttachments(
      {
        search: { AND: [{ field: 'name', operator: 'in', value: attachmentNamesKey.split(',') }] },
      },
      { path: 'attachment/search' },
    ).then((result) => {
      if (cancelled || !result) return;
      const next: Record<string, string> = {};
      for (const attachment of result.data) {
        if (!attachment.name) continue;
        next[attachment.name] = resolveLocaleVersionDisplayName(
          attachment.locale_versions,
          locale,
          attachment.name,
        );
      }
      setResolvedNames(next);
    });

    return () => {
      cancelled = true;
    };
    // searchAttachments is a new function identity on every render (useFetch isn't
    // memoized) — only the actual inputs below should re-trigger the fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachmentNamesKey, locale]);

  /**
   * Handle edit button click - opens edit modal
   */
  const handleEditClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // files[].displayName is the stale name baked in at save/parse time — carry
      // over the locale-resolved names (same ones shown in the card list above)
      // so the "Edit files" modal doesn't regress to the raw attachment name.
      setEditingFiles(
        files.map((file) => ({
          ...file,
          displayName: resolvedNames[file.attachmentName] ?? file.displayName,
        })),
      );
      setIsEditModalOpened(true);
    },
    [files, resolvedNames],
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

      {/* Files Container — hrefs are editor-preview URLs only. The backend's
          serve-by-name endpoint resolves the requested locale, falling back to the
          org default locale, then the first available version — the same fallback
          every other embed type (image/video/audio) already relies on. */}
      <div className={EMBED_FILES_CLASSES.FILES_CONTAINER}>
        {files.map((file, index) => {
          const displayName = resolvedNames[file.attachmentName] ?? file.displayName;
          const previewUrl = getAttachmentByNameRelativeUrl(file.attachmentName, locale);
          return (
            <div key={index} className={clsx(EMBED_FILES_CLASSES.FILE_ITEM)}>
              <a
                href={previewUrl}
                download
                className={EMBED_FILES_CLASSES.FILE_CONTENT}
                title={displayName}
              >
                <span className={EMBED_FILES_CLASSES.FILE_ICON}>📄</span>
                <span className={EMBED_FILES_CLASSES.FILE_LINK}>{displayName}</span>
              </a>
            </div>
          );
        })}
      </div>

      {/* Edit Modal */}
      <FilesSelectorModal
        backendHost={backendHost}
        user={user}
        setUser={setUser}
        locale={locale}
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
