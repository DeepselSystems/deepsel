import { useState, useEffect } from 'react';
import { ActionIcon, Button, Modal, Text, Tooltip } from '@mantine/core';
import { modals } from '@mantine/modals';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft } from '@fortawesome/free-solid-svg-icons';
import dayjs from 'dayjs';
import { ContentPreviewPanel } from './ContentPreviewPanel.jsx';
import { RevisionListPanel } from './RevisionListPanel.jsx';
import useFetch from '../../api/useFetch.js';
import NotificationState from '../../stores/NotificationState.js';

/**
 * Full-screen revision history modal for Pages and Blog Posts.
 * Left column: back header + content scroll. Right column: full-height revision list panel.
 * @param {object} props
 * @param {boolean} props.opened - Whether the modal is open
 * @param {Function} props.onClose - Callback to close the modal
 * @param {'page'|'blog'} props.contentType - Type of content being revised
 * @param {number} props.contentId - ID of the page_content or blog_post_content row
 * @param {boolean} props.hasWritePermission - Whether the user can restore revisions
 * @param {Function} props.onContentRestored - Callback fired after a successful restore
 */
export default function RevisionsModal({
  opened,
  onClose,
  contentType,
  contentId,
  hasWritePermission = false,
  onContentRestored,
}) {
  const { t } = useTranslation();
  const { notify } = NotificationState();
  const { post: restoreAPI } = useFetch('revision/restore', { autoFetch: false });

  const [selectedRevision, setSelectedRevision] = useState(
    /** @type {import('../../../typedefs/Revision').ContentRevision|null} */ null,
  );

  /** ID of the most recent revision — used to disable "Restore" when the latest is selected */
  const [latestRevisionId, setLatestRevisionId] = useState(/** @type {number|null} */ null);

  // Whether diff highlighting is active — owned here so both panels share the same value.
  const [showDiff, setShowDiff] = useState(true);

  /** Reset selection and latest revision tracking when modal closes */
  useEffect(() => {
    if (!opened) {
      setSelectedRevision(null);
      setLatestRevisionId(null);
    }
  }, [opened]);

  /** Reset selection and latest revision tracking when content switches */
  useEffect(() => {
    setSelectedRevision(null);
    setLatestRevisionId(null);
  }, [contentId]);

  /** True when the selected revision is already the most recent one — restoring would be a no-op */
  const isLatestSelected = selectedRevision?.id === latestRevisionId && latestRevisionId !== null;

  const revisionLabel = selectedRevision
    ? (selectedRevision.name ??
      dayjs.utc(selectedRevision.created_at).local().format('h:mm A, MMM D, YYYY'))
    : null;

  /** Maps contentType to the value expected by the restore API */
  const CONTENT_TYPE_MAP = { page: 'page_content', blog: 'blog_post_content' };

  const confirmRestore = () => {
    if (!selectedRevision) return;
    modals.openConfirmModal({
      title: <div className="font-semibold">{t('Restore this version?')}</div>,
      children: (
        <Text size="sm">
          {t('The current draft will be replaced with the content from')}{' '}
          <strong>{revisionLabel}</strong>.
        </Text>
      ),
      labels: { confirm: t('Restore'), cancel: t('Cancel') },
      confirmProps: { color: 'blue' },
      onConfirm: async () => {
        try {
          await restoreAPI({
            content_type: CONTENT_TYPE_MAP[contentType],
            content_id: contentId,
            revision_id: selectedRevision.id,
          });
          notify({ message: t('Content restored successfully.'), type: 'success' });
          onContentRestored?.();
        } catch (error) {
          notify({ message: error.message, type: 'error' });
        }
      },
    });
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      withCloseButton={false}
      fullScreen
      classNames={{
        inner: '!overflow-hidden',
        content: 'h-screen',
        body: '!p-0 flex h-full overflow-hidden',
      }}
    >
      {/* Left column */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        {/* Left header: back button + selected revision label + restore button */}
        <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-white">
          <ActionIcon variant="subtle" color="gray" onClick={onClose} aria-label={t('Close')}>
            <FontAwesomeIcon icon={faArrowLeft} />
          </ActionIcon>
          {revisionLabel && (
            <Text fw={600} size="sm" truncate className="flex-1">
              {revisionLabel}
            </Text>
          )}
          {hasWritePermission && selectedRevision && (
            <Tooltip
              label={t('This is already the current version')}
              disabled={!isLatestSelected}
              withArrow
              position="bottom"
            >
              <Button
                size="xs"
                variant="light"
                disabled={isLatestSelected}
                onClick={confirmRestore}
              >
                {t('Restore this version')}
              </Button>
            </Tooltip>
          )}
        </div>
        {/* Content preview — scrolls independently */}
        <ContentPreviewPanel
          selectedRevision={selectedRevision}
          contentType={contentType}
          showDiff={showDiff}
        />
      </div>

      {/* Right column — full height, owns title/filter/list/checkbox */}
      <div className="w-80 border-l border-gray-200 bg-gray-50 flex flex-col overflow-hidden min-h-0">
        <RevisionListPanel
          contentType={contentType}
          contentId={contentId}
          hasWritePermission={hasWritePermission}
          onContentRestored={onContentRestored}
          opened={opened}
          selectedRevision={selectedRevision}
          onRevisionSelect={setSelectedRevision}
          showDiff={showDiff}
          onShowDiffChange={setShowDiff}
          onLatestRevisionChange={setLatestRevisionId}
        />
      </div>
    </Modal>
  );
}
