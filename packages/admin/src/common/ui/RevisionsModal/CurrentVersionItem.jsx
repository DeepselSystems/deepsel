import { Badge, Group, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import dayjs from 'dayjs';

/**
 * Color palette for author indicator dots, shared with RevisionItem.
 * Cycled by owner_id to match Google Docs multi-user color convention.
 */
const AUTHOR_DOT_COLORS = [
  'bg-green-500',
  'bg-blue-500',
  'bg-purple-500',
  'bg-orange-500',
  'bg-pink-500',
  'bg-teal-500',
];

/**
 * @param {number|null} ownerId
 */
function getAuthorDotColor(ownerId) {
  if (!ownerId) return 'bg-gray-400';
  return AUTHOR_DOT_COLORS[ownerId % AUTHOR_DOT_COLORS.length];
}

/**
 * Top row in the revision list representing the current published version.
 * Always visible regardless of the filter. Has no context menu.
 *
 * Currently shows the last *published* version (content.content + last_modified_at).
 * To switch to unsaved draft: use content.draft_content + content.draft_last_modified_at
 * + content.draft_updated_by instead.
 *
 * @param {object} props
 * @param {import('../../../typedefs/Revision').CurrentVersionItem} props.currentVersionItem
 * @param {boolean} props.isSelected
 * @param {Function} props.onClick
 */
export function CurrentVersionItem({ currentVersionItem, isSelected, onClick }) {
  const { t } = useTranslation();

  const timeLabel = dayjs.utc(currentVersionItem.created_at).local().format('h:mm A, MMM D');

  const owner = currentVersionItem.owner;
  const authorLabel = owner
    ? `${owner.first_name ?? ''} ${owner.last_name ?? ''}`.trim() || owner.username
    : null;
  const dotColorClass = getAuthorDotColor(owner?.id ?? null);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
      className={clsx(
        'group relative flex items-start gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors select-none',
        isSelected
          ? 'bg-blue-50 border-l-2 border-blue-500 pl-2.5'
          : 'hover:bg-white border-l-2 border-transparent',
      )}
    >
      <Stack gap={2} className="flex-1 min-w-0">
        <Text size="sm" fw={600} className="leading-snug" truncate>
          {timeLabel}
        </Text>
        <Badge size="xs" variant="light" color="blue" className="w-fit">
          {t('Current version')}
        </Badge>
        {authorLabel && (
          <Group gap={6} wrap="nowrap">
            <div className={clsx('w-2 h-2 rounded-full flex-shrink-0', dotColorClass)} />
            <Text size="xs" c="dimmed" truncate>
              {authorLabel}
            </Text>
          </Group>
        )}
      </Stack>
    </div>
  );
}
