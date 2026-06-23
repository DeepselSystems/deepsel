import { Badge, Stack, Text, Group } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import dayjs from 'dayjs';
import { RevisionItemMenu } from './RevisionItemMenu.jsx';

/**
 * Color palette for author indicator dots, cycled by owner_id.
 * Matches the multi-user color convention used in Google Docs.
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
 * Returns a Tailwind bg color class for the author dot, derived from owner_id.
 * @param {number|null} ownerId
 */
function getAuthorDotColor(ownerId) {
  if (!ownerId) return 'bg-gray-400';
  return AUTHOR_DOT_COLORS[ownerId % AUTHOR_DOT_COLORS.length];
}

/**
 * Single revision row inside RevisionsModal.
 * Google Docs style: name/timestamp · timestamp · dot+author · context menu on hover.
 * @param {object} props
 * @param {import('../../../typedefs/Revision').ContentRevision} props.revision
 * @param {boolean} props.isSelected
 * @param {Function} props.onClick
 * @param {boolean} props.hasWritePermission
 * @param {Function} props.onRestoreSuccess
 * @param {Function} props.onNameChanged
 * @param {'page'|'blog'} props.contentType
 * @param {number} props.contentId
 * @param {boolean} [props.isLatest] - True for the most recent revision (replaces CurrentVersionItem)
 */
export function RevisionItem({
  revision,
  isSelected,
  onClick,
  hasWritePermission,
  onRestoreSuccess,
  onNameChanged,
  contentType,
  contentId,
  isLatest = false,
}) {
  const { t } = useTranslation();
  /** Full timestamp shown as primary label for unnamed revisions (matches Google Docs style) */
  const timeLabel = dayjs.utc(revision.created_at).local().format('h:mm A, MMM D');
  const dotColorClass = getAuthorDotColor(revision.owner_id);
  const authorLabel = revision.owner
    ? `${revision.owner.first_name ?? ''} ${revision.owner.last_name ?? ''}`.trim() ||
      revision.owner.username
    : null;

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
      {/* Named: [name] / [timestamp] / [dot+author]. Unnamed: [timestamp] / [dot+author] */}
      <Stack gap={2} className="flex-1 min-w-0">
        <Text size="sm" fw={600} className="leading-snug" truncate>
          {revision.name ?? timeLabel}
        </Text>
        {isLatest && (
          <Badge size="xs" variant="light" color="blue" className="w-fit">
            {t('Current version')}
          </Badge>
        )}
        {revision.name && (
          <Text size="xs" c="dimmed" truncate>
            {timeLabel}
          </Text>
        )}
        {authorLabel && (
          <Group gap={6} wrap="nowrap">
            <div className={clsx('w-2 h-2 rounded-full flex-shrink-0', dotColorClass)} />
            <Text size="xs" c="dimmed" truncate>
              {authorLabel}
            </Text>
          </Group>
        )}
      </Stack>

      {/* Context menu — visible on group hover */}
      {hasWritePermission && (
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <RevisionItemMenu
            revision={revision}
            contentType={contentType}
            contentId={contentId}
            onRestoreSuccess={onRestoreSuccess}
            onNameChanged={onNameChanged}
            isLatest={isLatest}
          />
        </div>
      )}
    </div>
  );
}
