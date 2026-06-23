import { useState, useCallback } from 'react';
import { Checkbox } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import clsx from 'clsx';
import { useDefaultLocale } from '../../../../common/hooks/useDefaultLocale.js';
import { useSelectedVersion } from '../../../../common/hooks/useSelectedVersion.js';
import { useAttachmentCardActions } from '../hooks/useAttachmentCardActions.js';
import { AttachmentCardOverlay } from '../../../../common/lib/ui/AttachmentCardOverlay.tsx';
import { AttachmentPreview } from '../../../../common/lib/ui/AttachmentPreview.tsx';
import { EditAttachmentModal } from './EditAttachmentModal.jsx';
import { AttachmentUsageModal } from './AttachmentUsageModal.jsx';

/**
 * @typedef AttachmentCardProps
 * @property {import('../../../../typedefs/AttachmentFile.js').AttachmentFile} attachment
 * @property {(attachment: import('../../../../typedefs/AttachmentFile.js').AttachmentFile) => void} onDelete
 * @property {boolean} selected - Whether this card is currently selected in bulk-select mode
 * @property {(attachment: import('../../../../typedefs/AttachmentFile.js').AttachmentFile) => void} onToggleSelect
 * @property {boolean} selectionMode - Whether bulk-select mode is active (shows checkbox)
 * @property {(updated: import('../../../../typedefs/AttachmentFile.js').AttachmentFile) => void} [onAttachmentUpdated] - Called when the attachment is updated via the edit modal
 */

/**
 * Displays a single attachment card with locale-version switching via flag chips,
 * preview (image or file-type icon), file meta, and hover actions (Copy Link, Download, Delete).
 *
 * Version selection: defaults to the site's default language version, or the first
 * available version when the default is not present. Clicking a flag in VersionFlagBar
 * switches the preview and meta to that locale version.
 *
 * @param {AttachmentCardProps} props
 */
export function AttachmentCard({
  attachment,
  onDelete,
  selected,
  onToggleSelect,
  selectionMode,
  onAttachmentUpdated,
}) {
  const [editOpened, { open: openEdit, close: closeEdit }] = useDisclosure(false);
  const [usageOpened, { open: openUsage, close: closeUsage }] = useDisclosure(false);

  // Local copy of locale_versions so card state can update without a full page refetch
  const [localVersions, setLocalVersions] = useState(attachment?.locale_versions ?? []);

  const { defaultLocaleId, availableLanguages } = useDefaultLocale();
  const { selectedVersion, selectedLocaleId, setSelectedLocale } = useSelectedVersion(
    localVersions,
    defaultLocaleId,
  );

  /**
   * Called by the edit modal after a successful save.
   * Replaces localVersions with the freshly returned attachment's versions.
   */
  const handleAttachmentSaved = useCallback(
    (updated) => {
      setLocalVersions(updated?.locale_versions ?? []);
      onAttachmentUpdated?.(updated);
    },
    [onAttachmentUpdated],
  );

  /**
   * Called by the overlay's "Delete this version" action after the API succeeds.
   * Removes the deleted version from localVersions and resets locale selection to auto-pick.
   */
  const handleVersionDeleted = useCallback(
    (versionId) => {
      setLocalVersions((prev) => prev.filter((v) => v.id !== versionId));
      setSelectedLocale(null);
    },
    [setSelectedLocale],
  );
  const hasVersion = selectedVersion != null;

  // Derive display values from the currently selected locale version
  const fileName = selectedVersion?.name ?? null;
  const isImage = selectedVersion?.content_type?.startsWith('image') ?? false;

  const { overlayActions } = useAttachmentCardActions({
    selectedVersion,
    fileName,
    attachment,
    onDelete,
    hasVersion,
    onEdit: openEdit,
    onVersionDeleted: handleVersionDeleted,
    onFindUsage: openUsage,
  });

  /** Triggers bulk-select toggle when selection mode is active. @param {React.MouseEvent} _ */
  const handleCardClick = (_) => {
    if (selectionMode) onToggleSelect(attachment);
  };

  /** Toggles selection without propagating the click to the card. @param {React.MouseEvent} e */
  const handleCheckboxClick = (e) => {
    e.stopPropagation();
    onToggleSelect(attachment);
  };

  return (
    <div
      className={clsx(
        'relative cursor-pointer border rounded overflow-hidden',
        selected ? 'border-primary-main ring-2 ring-primary-main' : 'border-gray-300',
      )}
      onClick={handleCardClick}
    >
      {/* Bulk-select checkbox — visible on hover or when selection mode is active */}
      <div
        className={clsx(
          'absolute top-2 left-2 z-10 bg-white rounded p-0.5 shadow transition-opacity',
          selected || selectionMode ? 'opacity-100' : 'opacity-0',
        )}
        onClick={handleCheckboxClick}
      >
        <Checkbox checked={selected} onChange={() => {}} size="sm" />
      </div>

      <AttachmentPreview
        attachment={attachment}
        versions={localVersions}
        selectedLocaleId={selectedLocaleId}
        onSelectLocale={setSelectedLocale}
        defaultLocaleId={defaultLocaleId}
        availableLanguages={availableLanguages}
        overlay={<AttachmentCardOverlay actions={overlayActions} blurred={isImage && hasVersion} />}
      />

      {/* Edit modal — mounted per card so each card manages its own state */}
      <EditAttachmentModal
        attachment={attachment}
        opened={editOpened}
        onClose={closeEdit}
        onSaved={handleAttachmentSaved}
        availableLanguages={availableLanguages}
      />

      {/* Usage modal — lists pages/blog posts/templates embedding this attachment */}
      <AttachmentUsageModal
        key={`attachment-usage-${attachment.id}-${selectedLocaleId}`}
        attachment={attachment}
        opened={usageOpened}
        onClose={closeUsage}
        localeId={selectedLocaleId}
      />
    </div>
  );
}
