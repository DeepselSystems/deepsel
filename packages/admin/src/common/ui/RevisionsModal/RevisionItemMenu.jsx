import { ActionIcon, Menu, Text, TextInput, Button, Group, Tooltip } from '@mantine/core';
import { modals } from '@mantine/modals';
import {
  IconDotsVertical,
  IconHistoryToggle,
  IconTag,
  IconPencil,
  IconTagOff,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import useFetch from '../../api/useFetch.js';
import NotificationState from '../../stores/NotificationState.js';

/** Maps contentType prop to the value expected by POST /revision/* endpoints */
const CONTENT_TYPE_MAP = {
  page: 'page_content',
  blog: 'blog_post_content',
};

/**
 * Controlled name input rendered inside a Mantine modal.
 * Uses a mutable ref to pass the current value back to the caller on confirm.
 */
function NameModalContent({ initialName, nameRef, onConfirm, onCancel }) {
  const { t } = useTranslation();

  return (
    <div>
      <TextInput
        defaultValue={initialName}
        onChange={(e) => {
          nameRef.current = e.currentTarget.value;
        }}
        placeholder={t('e.g. Before redesign')}
        autoFocus
        mb="md"
      />
      <Group justify="flex-end" gap="xs">
        <Button variant="subtle" color="gray" size="sm" onClick={onCancel}>
          {t('Cancel')}
        </Button>
        <Button size="sm" onClick={onConfirm}>
          {t('Save')}
        </Button>
      </Group>
    </div>
  );
}

/**
 * Context menu for a single revision row.
 * Renders the trigger button + all dropdown items and owns all action logic.
 * @param {object} props
 * @param {import('../../../typedefs/Revision').ContentRevision} props.revision
 * @param {'page'|'blog'} props.contentType
 * @param {number} props.contentId
 * @param {Function} props.onRestoreSuccess - called after a successful restore
 * @param {Function} props.onNameChanged - called after a name is set, updated, or cleared
 * @param {boolean} [props.isLatest] - True when this is the most recent revision; disables the Restore action
 */
export function RevisionItemMenu({
  revision,
  contentType,
  contentId,
  onRestoreSuccess,
  onNameChanged,
  isLatest = false,
}) {
  const { t } = useTranslation();
  const { notify } = NotificationState();
  const { post: restoreAPI } = useFetch('revision/restore', { autoFetch: false });
  const { post: nameAPI } = useFetch('revision/name', { autoFetch: false });

  const timeLabel = dayjs.utc(revision.created_at).local().format('h:mm A, MMM D');
  const apiContentType = CONTENT_TYPE_MAP[contentType];

  const confirmRestore = () => {
    modals.openConfirmModal({
      title: <div className="font-semibold">{t('Restore this version?')}</div>,
      children: (
        <Text size="sm">
          {t('The current draft will be replaced with the content from')}{' '}
          <strong>{revision.name ?? timeLabel}</strong>.
        </Text>
      ),
      labels: { confirm: t('Restore'), cancel: t('Cancel') },
      confirmProps: { color: 'blue' },
      onConfirm: async () => {
        try {
          await restoreAPI({
            content_type: apiContentType,
            content_id: contentId,
            revision_id: revision.id,
          });
          notify({ message: t('Content restored successfully.'), type: 'success' });
          onRestoreSuccess?.();
        } catch (error) {
          notify({ message: error.message, type: 'error' });
        }
      },
    });
  };

  const openNameModal = (initialName = '') => {
    const nameRef = { current: initialName };
    const isRename = Boolean(initialName);

    modals.open({
      title: (
        <div className="font-semibold">
          {isRename ? t('Rename version') : t('Name this version')}
        </div>
      ),
      children: (
        <NameModalContent
          initialName={initialName}
          nameRef={nameRef}
          onCancel={() => modals.closeAll()}
          onConfirm={async () => {
            const trimmed = nameRef.current.trim();
            if (!trimmed) return;
            try {
              await nameAPI({
                content_type: apiContentType,
                revision_id: revision.id,
                name: trimmed,
              });
              notify({ message: t('Version name saved.'), type: 'success' });
              modals.closeAll();
              onNameChanged?.();
            } catch (error) {
              notify({ message: error.message, type: 'error' });
            }
          }}
        />
      ),
    });
  };

  const confirmDeleteName = () => {
    modals.openConfirmModal({
      title: <div className="font-semibold">{t('Delete version name?')}</div>,
      children: (
        <Text size="sm">
          {t('This will remove the name from')} <strong>{revision.name}</strong>.
        </Text>
      ),
      labels: { confirm: t('Delete'), cancel: t('Cancel') },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await nameAPI({
            content_type: apiContentType,
            revision_id: revision.id,
            name: null,
          });
          notify({ message: t('Version name removed.'), type: 'success' });
          onNameChanged?.();
        } catch (error) {
          notify({ message: error.message, type: 'error' });
        }
      },
    });
  };

  return (
    <Menu shadow="sm" position="bottom-end" withinPortal>
      <Menu.Target>
        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          onClick={(e) => e.stopPropagation()}
          aria-label={t('Revision options')}
        >
          <IconDotsVertical size={14} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Tooltip
          label={t('This is already the current version')}
          disabled={!isLatest}
          withArrow
          position="left"
        >
          <Menu.Item
            leftSection={<IconHistoryToggle size={14} />}
            disabled={isLatest}
            onClick={(e) => {
              e.stopPropagation();
              confirmRestore();
            }}
          >
            {t('Restore this version')}
          </Menu.Item>
        </Tooltip>
        {!revision.name && (
          <Menu.Item
            leftSection={<IconTag size={14} />}
            onClick={(e) => {
              e.stopPropagation();
              openNameModal('');
            }}
          >
            {t('Name this version')}
          </Menu.Item>
        )}
        {revision.name && (
          <Menu.Item
            leftSection={<IconPencil size={14} />}
            onClick={(e) => {
              e.stopPropagation();
              openNameModal(revision.name);
            }}
          >
            {t('Rename')}
          </Menu.Item>
        )}
        {revision.name && (
          <Menu.Item
            leftSection={<IconTagOff size={14} />}
            color="red"
            onClick={(e) => {
              e.stopPropagation();
              confirmDeleteName();
            }}
          >
            {t('Delete name')}
          </Menu.Item>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}
