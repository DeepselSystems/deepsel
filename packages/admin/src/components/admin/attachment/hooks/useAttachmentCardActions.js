import { useTranslation } from 'react-i18next';
import {
  IconDownload,
  IconLink,
  IconPencil,
  IconSearch,
  IconTrash,
  IconTrashX,
} from '@tabler/icons-react';
import {
  getAttachmentUrl,
  getAttachmentRelativeUrl,
  downloadFromAttachUrl,
} from '../../../../common/utils/index.js';
import NotificationState from '../../../../common/stores/NotificationState.js';
import BackendHostURLState from '../../../../common/stores/BackendHostURLState.js';
import useModel from '../../../../common/api/useModel.jsx';

/**
 * @typedef UseAttachmentCardActionsParams
 * @property {import('../../../../typedefs/AttachmentFile.js').AttachmentLocaleVersion | null} selectedVersion
 * @property {string|null} fileName - Filename of the currently selected locale version
 * @property {import('../../../../typedefs/AttachmentFile.js').AttachmentFile} attachment - The parent attachment record
 * @property {(attachment: import('../../../../typedefs/AttachmentFile.js').AttachmentFile) => void} onDelete - Delete callback from parent
 * @property {boolean} hasVersion - Whether the selected locale has an uploaded file; false = show edit-only actions
 * @property {() => void} [onEdit] - Opens the edit modal for this attachment
 * @property {(versionId: number) => void} [onVersionDeleted] - Called after a locale version is successfully deleted
 * @property {() => void} [onFindUsage] - Opens the usage modal for this attachment
 */

/**
 * @typedef UseAttachmentCardActionsResult
 * @property {(e: React.MouseEvent) => Promise<void>} handleCopyLink
 * @property {(e: React.MouseEvent) => void} handleDownload
 * @property {(e: React.MouseEvent) => void} handleDelete
 * @property {(e: React.MouseEvent) => void} handleEdit
 * @property {(e: React.MouseEvent) => void} handleDeleteVersion
 * @property {import('../components/AttachmentCardOverlay.jsx').OverlayAction[]} overlayActions
 */

/**
 * Encapsulates all hover-overlay action logic for an attachment card.
 * Returns both individual handlers and the pre-built overlayActions array
 * ready to pass to AttachmentCardOverlay.
 *
 * @param {UseAttachmentCardActionsParams} params
 * @returns {UseAttachmentCardActionsResult}
 */
export function useAttachmentCardActions({
  selectedVersion,
  fileName,
  attachment,
  onDelete,
  hasVersion,
  onEdit,
  onVersionDeleted,
  onFindUsage,
}) {
  const { t } = useTranslation();
  const { backendHost } = BackendHostURLState((state) => state);
  const { notify } = NotificationState((state) => state);
  const { deleteWithConfirm: deleteVersion } = useModel(`attachment_locale_version`, {
    pageSize: null,
    autoFetch: false,
  });

  /** Copies the frontend-proxied serve URL of the active locale version to the clipboard. */
  const handleCopyLink = async (event) => {
    event.stopPropagation();
    if (!fileName) return;
    const attachUrl = window.location.origin + getAttachmentRelativeUrl(fileName);
    try {
      await navigator.clipboard.writeText(attachUrl);
      notify({ title: t('Success'), message: t('Link copied to clipboard'), type: 'success' });
    } catch (error) {
      console.error('Failed to copy link:', error);
      notify({ title: t('Error'), message: t('Failed to copy link'), type: 'error' });
    }
  };

  /** Initiates file download for the active locale version. */
  const handleDownload = (event) => {
    event.stopPropagation();
    if (!fileName) return;
    downloadFromAttachUrl(getAttachmentUrl(backendHost, fileName));
  };

  /** Delegates deletion of the whole attachment to the parent. */
  const handleDelete = (event) => {
    event.stopPropagation();
    onDelete(attachment);
  };

  /** Opens the edit modal for this attachment. */
  const handleEdit = (event) => {
    event.stopPropagation();
    onEdit?.();
  };

  /** Opens the usage modal for this attachment. */
  const handleFindUsage = (event) => {
    event.stopPropagation();
    onFindUsage?.();
  };

  /** Deletes only the currently selected locale version and notifies the card to update local state. */
  const handleDeleteVersion = (event) => {
    event.stopPropagation();
    if (!selectedVersion?.id) return;
    const deletedId = selectedVersion.id;
    deleteVersion(
      [deletedId],
      () => {
        notify({ title: t('Success'), message: t('Version deleted'), type: 'success' });
        onVersionDeleted?.(deletedId);
      },
      (error) => {
        console.error('Failed to delete version:', error);
        notify({ title: t('Error'), message: t('Failed to delete version'), type: 'error' });
      },
    );
  };

  /** Full action set when a file exists for the selected locale. */
  const fullActions = [
    { key: 'copy-link', icon: IconLink, label: t('Copy Link'), onClick: handleCopyLink },
    { key: 'download', icon: IconDownload, label: t('Download'), onClick: handleDownload },
    { key: 'edit', icon: IconPencil, label: t('Edit'), onClick: handleEdit },
    { key: 'find-usage', icon: IconSearch, label: t('Find usage'), onClick: handleFindUsage },
    {
      key: 'delete-version',
      icon: IconTrashX,
      label: t('Delete this version'),
      onClick: handleDeleteVersion,
      color: 'orange',
    },
    { key: 'delete', icon: IconTrash, label: t('Delete'), onClick: handleDelete, color: 'red' },
  ];

  /** Reduced action set when the selected locale has no file yet. */
  const briefActions = [
    { key: 'edit', icon: IconPencil, label: t('Edit'), onClick: handleEdit },
    { key: 'find-usage', icon: IconSearch, label: t('Find usage'), onClick: handleFindUsage },
    { key: 'delete', icon: IconTrash, label: t('Delete'), onClick: handleDelete, color: 'red' },
  ];

  /**
   * Actions exposed to the overlay — filtered based on whether a version exists.
   * @type {import('../components/AttachmentCardOverlay.jsx').OverlayAction[]}
   */
  const overlayActions = hasVersion ? fullActions : briefActions;

  return {
    handleCopyLink,
    handleDownload,
    handleDelete,
    handleEdit,
    handleDeleteVersion,
    overlayActions,
  };
}
