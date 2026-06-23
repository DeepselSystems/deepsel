import { useTranslation } from 'react-i18next';
import {
  ActionIcon,
  Button,
  Group,
  Modal,
  Paper,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { Dropzone } from '@mantine/dropzone';
import { IconCloudUpload, IconFile, IconPhoto, IconPlus, IconX } from '@tabler/icons-react';
import clsx from 'clsx';
import { formatFileSize } from '@deepsel/cms-utils/common/utils';
import { LocaleFlag } from '../../../../common/ui/LocaleFlag.jsx';
import { useAttachmentEdit } from '../hooks/useAttachmentEdit.js';
import orderBy from 'lodash/orderBy';

/**
 * Builds a Mantine Select options list from the org language list.
 * Excludes already-used locales unless it is the current row's own locale.
 *
 * @param {import('../../../../typedefs/Organization.js').OrgLanguage[]} availableLanguages
 * @param {Set<number>} usedLocaleIds
 * @param {number|null} [currentLocaleId]
 * @returns {{ value: string, label: string }[]}
 */
function buildLocaleOptions(availableLanguages, usedLocaleIds, currentLocaleId = null) {
  return availableLanguages
    .filter((l) => l.id === currentLocaleId || !usedLocaleIds.has(l.id))
    .map((l) => ({ value: String(l.id), label: l.name }));
}

/**
 * Compact single-file drop zone for staging a replacement or new file.
 * Displays the staged file name when a file is already chosen.
 *
 * @param {{ onDrop: (file: File) => void, stagedFile: File|null, loading: boolean }} props
 */
function CompactDropzone({ onDrop, stagedFile, loading }) {
  const { t } = useTranslation();

  const handleDrop = (files) => {
    if (files[0]) onDrop(files[0]);
  };

  return (
    <Dropzone
      onDrop={handleDrop}
      maxFiles={1}
      disabled={loading}
      className={clsx(
        'border border-dashed border-gray-300 rounded-md cursor-pointer',
        'hover:border-primary-main transition-colors',
      )}
    >
      <Group gap="xs" justify="center" className="py-2 px-3 pointer-events-none">
        <Dropzone.Accept>
          <IconCloudUpload size={14} className="text-green-500 shrink-0" />
        </Dropzone.Accept>
        <Dropzone.Idle>
          {stagedFile ? (
            <IconFile size={14} className="text-blue-400 shrink-0" />
          ) : (
            <IconPhoto size={14} className="text-gray-400 shrink-0" />
          )}
        </Dropzone.Idle>
        <Text size="xs" className="text-gray-500 truncate max-w-xs">
          {stagedFile ? stagedFile.name : t('Drop file here or click to replace')}
        </Text>
      </Group>
    </Dropzone>
  );
}

/**
 * Vertical card for an existing locale version.
 * Shows a preview, a compact Dropzone for file replacement, a locale Select, and an alt-text Textarea.
 * All changes are staged locally until "Save Changes" is clicked.
 *
 * @param {{
 *   version: import('../../../../typedefs/AttachmentFile.js').AttachmentLocaleVersion,
 *   draft: import('../hooks/useAttachmentEdit.js').LocalVersionDraft,
 *   localeOptions: { value: string, label: string }[],
 *   stagedFile: File|null,
 *   previewUrl: string|null,
 *   isImage: boolean,
 *   onDraftChange: (patch: Partial<import('../hooks/useAttachmentEdit.js').LocalVersionDraft>) => void,
 *   onReplaceFile: (file: File) => void,
 *   loading: boolean,
 * }} props
 */
function ExistingVersionCard({
  version,
  draft,
  stagedFile,
  previewUrl,
  isImage,
  onDraftChange,
  onReplaceFile,
  loading,
}) {
  const { t } = useTranslation();

  /** Extension of the staged replacement file (or fall back to existing version's ext). */
  const replacementExt = (() => {
    const src = stagedFile ? stagedFile.name : version.name;
    const d = src.lastIndexOf('.');
    return d > 0 ? src.slice(d + 1) : '';
  })();

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="sm">
        {/* Locale indicator header */}
        <Group gap="xs" align="center">
          <LocaleFlag
            className="!opacity-100"
            locale={version.locale}
            selected={false}
            noFile={false}
            onClick={() => {}}
          />
          <Text size="sm" fw={500}>
            {version.locale?.name ?? t('Unknown locale')}
          </Text>
        </Group>

        {/* File preview */}
        <div className="w-full h-32 rounded-md overflow-hidden bg-gray-100 flex items-center justify-center">
          {isImage && previewUrl ? (
            <img
              src={previewUrl}
              className="w-full h-full object-cover"
              alt={draft.altText || version.name}
            />
          ) : (
            <div className="flex flex-col items-center gap-1 text-gray-400">
              <IconFile size={28} />
              <Text size="xs" className="text-center px-2 max-w-full truncate">
                {stagedFile ? stagedFile.name : version.name}
              </Text>
            </div>
          )}
        </div>

        {/* Current file info */}
        <Text size="xs" c="dimmed" className="truncate">
          {version.name}
          {version.filesize ? ` · ${formatFileSize(version.filesize)}` : ''}
        </Text>

        {/* Replace file */}
        <Stack gap={4}>
          <Text size="xs" fw={500}>
            {t('Replace file')}
          </Text>
          <CompactDropzone onDrop={onReplaceFile} stagedFile={stagedFile} loading={loading} />
        </Stack>

        {/* Name — always editable; extension is read-only suffix */}
        <TextInput
          label={t('Name')}
          description={t(
            'SEO tip: use language-specific keywords as the file name for each locale version.',
          )}
          value={draft.name}
          onChange={(e) => onDraftChange({ name: e.target.value })}
          placeholder={(() => {
            const d = version.name.lastIndexOf('.');
            return d > 0 ? version.name.slice(0, d) : version.name;
          })()}
          rightSection={
            replacementExt ? (
              <Text size="xs" c="dimmed" className="pr-1">
                .{replacementExt}
              </Text>
            ) : null
          }
          rightSectionWidth={replacementExt ? Math.max(40, (replacementExt.length + 2) * 8) : 0}
          size="xs"
          disabled={loading}
        />

        {/* Locale select */}
        {/* Hide locale select for edtting */}

        {/* Alt text */}
        <Textarea
          label={t('Alt text')}
          description={t(
            'Alternative text for this file. Used by screen readers and shown when the image cannot load.',
          )}
          value={draft.altText}
          onChange={(e) => onDraftChange({ altText: e.target.value })}
          placeholder={t('Describe the file content')}
          size="xs"
          autosize
          minRows={2}
          disabled={loading}
        />
      </Stack>
    </Paper>
  );
}

/**
 * Vertical card for staging a brand-new locale version.
 * Shows a file Dropzone, locale Select, name input, and alt text Textarea.
 * Removable until saved.
 *
 * @param {{
 *   pendingVersion: import('../hooks/useAttachmentEdit.js').PendingNewVersion,
 *   localeOptions: { value: string, label: string }[],
 *   onUpdate: (patch: Partial<import('../hooks/useAttachmentEdit.js').PendingNewVersion>) => void,
 *   onRemove: () => void,
 *   loading: boolean,
 * }} props
 */
function PendingVersionCard({ pendingVersion, localeOptions, onUpdate, onRemove, loading }) {
  const { t } = useTranslation();

  /** Extension derived from the staged file — displayed as a read-only suffix. */
  const fileExt = pendingVersion.file
    ? (() => {
        const d = pendingVersion.file.name.lastIndexOf('.');
        return d > 0 ? pendingVersion.file.name.slice(d + 1) : '';
      })()
    : null;

  return (
    <Paper withBorder p="md" radius="md" className="border-dashed">
      <Stack gap="sm">
        {/* Header */}
        <Group justify="space-between" align="center">
          <Text size="xs" fw={500} c="dimmed">
            {t('New version')}
          </Text>
          <Tooltip label={t('Remove')} withArrow>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              onClick={onRemove}
              disabled={loading}
              aria-label={t('Remove pending version')}
            >
              <IconX size={13} />
            </ActionIcon>
          </Tooltip>
        </Group>

        {/* Staged image preview */}
        {pendingVersion.previewUrl && (
          <div className="w-full h-32 rounded-md overflow-hidden bg-gray-100">
            <img
              src={pendingVersion.previewUrl}
              className="w-full h-full object-cover"
              alt={t('Staged file preview')}
            />
          </div>
        )}

        {/* File dropzone */}
        <Stack gap={4}>
          <Text size="xs" fw={500}>
            {t('File')}
          </Text>
          <CompactDropzone
            onDrop={(file) => onUpdate({ file })}
            stagedFile={pendingVersion.file}
            loading={loading}
          />
        </Stack>

        {/* Name — base name only; extension is immutable and shown as suffix */}
        <TextInput
          label={t('Name')}
          description={t(
            'SEO tip: use language-specific keywords as the file name for each locale version.',
          )}
          value={pendingVersion.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          placeholder={t('e.g. hero-image')}
          rightSection={
            fileExt ? (
              <Text size="xs" c="dimmed" className="pr-1">
                .{fileExt}
              </Text>
            ) : null
          }
          rightSectionWidth={fileExt ? Math.max(40, (fileExt.length + 2) * 8) : 0}
          size="xs"
          disabled={loading}
        />

        {/* Locale select */}
        <Select
          label={t('Language')}
          description={t('The locale this version is assigned to')}
          value={pendingVersion.localeId != null ? String(pendingVersion.localeId) : null}
          data={localeOptions}
          onChange={(val) => onUpdate({ localeId: val != null ? Number(val) : null })}
          placeholder={t('Select language')}
          size="xs"
          disabled={loading}
        />

        {/* Alt text */}
        <Textarea
          label={t('Alt text')}
          description={t(
            'Alternative text for this file. Used by screen readers and shown when the image cannot load.',
          )}
          value={pendingVersion.altText}
          onChange={(e) => onUpdate({ altText: e.target.value })}
          placeholder={t('Describe the file content')}
          size="xs"
          autosize
          minRows={2}
          disabled={loading}
        />
      </Stack>
    </Paper>
  );
}

/**
 * @typedef EditAttachmentModalProps
 * @property {import('../../../../typedefs/AttachmentFile.js').AttachmentFile} attachment - The attachment to edit
 * @property {boolean} opened - Whether the modal is visible
 * @property {() => void} onClose - Called when the modal should close
 * @property {(updated: import('../../../../typedefs/AttachmentFile.js').AttachmentFile) => void} [onSaved] - Called after a successful save with the updated attachment
 * @property {import('../../../../typedefs/Organization.js').OrgLanguage[]} availableLanguages - Languages configured for this org
 */

/**
 * Modal for editing all locale versions of an attachment.
 *
 * All changes (metadata edits, file replacements, new versions) are staged locally
 * and only submitted to the backend when "Save Changes" is clicked.
 *
 * Features:
 * - Vertical card per existing locale version with preview, file replacement Dropzone,
 *   locale Select, and alt-text Textarea
 * - "Add language" creates a pending card (locale + file) appended to the grid
 * - Locale selectors exclude already-used locales to prevent duplicates
 * - "Save Changes" is disabled until there is at least one staged change
 * - Modal blocks accidental close when there are staged changes or a save is in progress
 *
 * @param {EditAttachmentModalProps} props
 */
export function EditAttachmentModal({ attachment, opened, onClose, onSaved, availableLanguages }) {
  const { t } = useTranslation();

  const {
    versions,
    usedLocaleIds,
    getDraft,
    updateDraft,
    stageFileReplacement,
    pendingFileReplacements,
    addPendingVersion,
    updatePendingVersion,
    removePendingVersion,
    pendingNewVersions,
    hasPendingChanges,
    isSaveEnabled,
    getVersionPreviewUrl,
    isVersionImage,
    saveAll,
    loading,
  } = useAttachmentEdit({ attachment, onSaved });

  /** Saves all staged changes then closes the modal. */
  const handleSave = async () => {
    await saveAll();
    onClose();
  };

  /** Locale options for the "Add version" cards — excludes all already-used locales. */
  const availableForNew = buildLocaleOptions(availableLanguages, usedLocaleIds);

  const hasAnything = versions.length > 0 || pendingNewVersions.length > 0;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        attachment?.name ? t('Edit "{{name}}"', { name: attachment.name }) : t('Edit Attachment')
      }
      size="xl"
      closeOnClickOutside={!hasPendingChanges && !loading}
      closeOnEscape={!loading}
    >
      <Stack gap="md">
        {!hasAnything && (
          <Text size="sm" c="dimmed" className="text-center py-4">
            {t('No versions uploaded yet. Add one below.')}
          </Text>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Existing version cards */}
          {versions.length > 0 &&
            orderBy(versions, (o) => o.created_at).map((version) => (
              <ExistingVersionCard
                key={version.id}
                version={version}
                draft={getDraft(version)}
                localeOptions={buildLocaleOptions(
                  availableLanguages,
                  usedLocaleIds,
                  version.locale_id,
                )}
                stagedFile={pendingFileReplacements[version.id]?.file ?? null}
                previewUrl={getVersionPreviewUrl(version)}
                isImage={isVersionImage(version)}
                onDraftChange={(patch) => updateDraft(version.id, patch)}
                onReplaceFile={(file) => stageFileReplacement(version.id, file)}
                loading={loading}
              />
            ))}

          {/* Pending new version cards */}
          {pendingNewVersions.length > 0 &&
            pendingNewVersions.map((pv) => (
              <PendingVersionCard
                key={pv.tempId}
                pendingVersion={pv}
                localeOptions={buildLocaleOptions(availableLanguages, usedLocaleIds, pv.localeId)}
                onUpdate={(patch) => updatePendingVersion(pv.tempId, patch)}
                onRemove={() => removePendingVersion(pv.tempId)}
                loading={loading}
              />
            ))}

          {/* Add language button — hidden when all locales are already in use */}
          {availableForNew.length > 0 && (
            <Button
              variant="subtle"
              size="xs"
              leftSection={<IconPlus size={13} />}
              onClick={addPendingVersion}
              disabled={loading}
              className="self-start"
            >
              {t('Add language')}
            </Button>
          )}
        </div>
      </Stack>

      <Group justify="flex-end" mt="lg" gap="sm">
        <Button variant="subtle" onClick={onClose} disabled={loading}>
          {t('Cancel')}
        </Button>
        <Button onClick={handleSave} loading={loading} disabled={!isSaveEnabled}>
          {t('Save Changes')}
        </Button>
      </Group>
    </Modal>
  );
}
