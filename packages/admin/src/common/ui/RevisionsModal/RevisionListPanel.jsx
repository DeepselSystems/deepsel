import { useState, useEffect, useCallback, useMemo } from 'react';
import { Checkbox, Loader, ScrollArea, Select, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { IconChevronDown } from '@tabler/icons-react';
import { RevisionItem } from './RevisionItem.jsx';
import useModel from '../../api/useModel.jsx';
import dayjs from 'dayjs';
import head from 'lodash/head';

/**
 * Filter options for the revision list.
 * 'all' shows every revision; 'named' shows only revisions with a custom name.
 */
const REVISION_FILTER_ALL = 'all';
const REVISION_FILTER_NAMED = 'named';

/** Sort newest revision first */
const REVISION_ORDER_BY = { field: 'created_at', direction: 'desc' };

/**
 * Groups an array of revisions (sorted newest-first) into date buckets.
 * Returns an ordered array of { label, items } — Today first, then Yesterday, then older dates.
 * @param {import('../../../typedefs/Revision').ContentRevision[]} revisions
 * @returns {{ label: string, items: import('../../../typedefs/Revision').ContentRevision[] }[]}
 */
function groupRevisionsByDate(revisions) {
  const today = dayjs().startOf('day');
  const yesterday = today.subtract(1, 'day');
  const groups = new Map();

  revisions.forEach((revision) => {
    const date = dayjs.utc(revision.created_at).local().startOf('day');
    let label;
    if (date.isSame(today)) {
      label = 'Today';
    } else if (date.isSame(yesterday)) {
      label = 'Yesterday';
    } else {
      label = date.format('MMM D, YYYY');
    }
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(revision);
  });

  return [...groups.entries()].map(([label, items]) => ({ label, items }));
}

/**
 * All backend identifiers needed for a given contentType.
 *
 * revisionModel — model name for the revision search endpoint
 * contentModel  — model name for the parent content fetch endpoint
 * filterField   — FK field used to filter revisions by contentId
 * contentField  — key on ContentRevision that holds the nested parent content object
 *                 (used by ContentPreviewPanel to extract lang/org for Jinja2 rendering)
 *
 * To add a new content type, add a case here — all consumers derive their config from this.
 *
 * @param {'page'|'blog'} contentType
 * @returns {{ revisionModel: string|null, filterField: string|null }}
 */
function getRevisionConfig(contentType) {
  switch (contentType) {
    case 'page':
      return { revisionModel: 'page_content_revision', filterField: 'page_content_id' };
    case 'blog':
      return { revisionModel: 'blog_post_content_revision', filterField: 'blog_post_content_id' };
    default:
      return { revisionModel: null, filterField: null };
  }
}

/**
 * Right-hand panel of RevisionsModal showing revision history for Pages and Blog Posts.
 * Fetches revision records directly from the revision model filtered by contentId.
 * @param {object} props
 * @param {'page'|'blog'|'template'} props.contentType - Type of content (template not yet implemented)
 * @param {number} props.contentId - ID of the page_content or blog_post_content row
 * @param {boolean} props.hasWritePermission - Whether the user can restore revisions
 * @param {Function} props.onContentRestored - Callback fired after a successful restore
 * @param {boolean} props.opened - Whether the parent modal is open (triggers fetch)
 * @param {import('../../../typedefs/Revision').ContentRevision|null} props.selectedRevision - Currently selected revision (lifted state)
 * @param {Function} props.onRevisionSelect - Called when the user clicks a revision row
 * @param {boolean} props.showDiff - Whether diff highlighting is active (owned by RevisionsModal)
 * @param {Function} props.onShowDiffChange - Called with new boolean when the checkbox is toggled
 * @param {Function} [props.onLatestRevisionChange] - Called with the latest revision ID (or null) when revisions load or change
 */
export function RevisionListPanel({
  contentType,
  contentId,
  hasWritePermission = false,
  onContentRestored,
  opened,
  selectedRevision,
  onRevisionSelect,
  showDiff,
  onShowDiffChange,
  onLatestRevisionChange = undefined,
}) {
  const { t } = useTranslation();

  const selectedRevisionId = selectedRevision?.id ?? null;
  const [filter, setFilter] = useState(REVISION_FILTER_ALL);

  const { revisionModel, filterField } = getRevisionConfig(contentType);

  /** Always call useModel unconditionally; guard fetching via autoFetch:false + manual get() */
  const {
    data: revisions,
    loading,
    get,
  } = useModel(revisionModel ?? 'page_content_revision', {
    autoFetch: false,
    pageSize: null,
  });

  // Memoize the latest revision ID for easy access
  const latestRevisionId = useMemo(() => head(revisions)?.id ?? null, [revisions]);

  const fetchRevisions = useCallback(() => {
    if (!contentId || !revisionModel || !filterField) return;
    get({
      order_by: REVISION_ORDER_BY,
      search: {
        AND: [{ field: filterField, operator: '=', value: contentId }],
        OR: [],
      },
    });
    // `get` is not useCallback-wrapped in useModel so its reference changes every render.
    // We always pass a full queryObject so the stale closure is safe to ignore.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentId, revisionModel, filterField]);

  /**
   * Fetch revisions when the modal opens.
   */
  useEffect(() => {
    if (opened && contentId && revisionModel) {
      fetchRevisions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, contentId, fetchRevisions, revisionModel]);

  /**
   * Notify parent of the latest revision ID whenever the list loads or changes.
   * Also auto-select the newest revision if nothing is selected yet.
   */
  useEffect(() => {
    onLatestRevisionChange?.(latestRevisionId);
    if (selectedRevision) return;
    if (revisions.length > 0) {
      onRevisionSelect(head(revisions));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revisions]);

  const filterOptions = [
    { value: REVISION_FILTER_ALL, label: t('All versions') },
    { value: REVISION_FILTER_NAMED, label: t('Named versions only') },
  ];

  /** @type {import('../../../typedefs/Revision').ContentRevision[]} */
  const visibleRevisions =
    filter === REVISION_FILTER_NAMED ? revisions.filter((r) => r.name) : revisions;

  const dateGroups = groupRevisionsByDate(visibleRevisions);

  /** Called by RevisionItem after a successful restore */
  const handleRestoreSuccess = useCallback(() => {
    fetchRevisions();
    onContentRestored?.();
  }, [fetchRevisions, onContentRestored]);

  /** Called by RevisionItem after a name is set, updated, or cleared */
  const handleNameChanged = useCallback(() => {
    fetchRevisions();
  }, [fetchRevisions]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Panel header: title + filter */}
      <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b border-gray-200">
        <Text fw={700} size="lg" mb="sm">
          {t('Revision History')}
        </Text>
        <Select
          data={filterOptions}
          value={filter}
          onChange={setFilter}
          rightSection={<IconChevronDown size={14} />}
          comboboxProps={{ shadow: 'sm' }}
        />
      </div>

      {/* Revision list */}
      <ScrollArea className="flex-1 px-4 pb-4">
        {loading ? (
          <div className="flex justify-center mt-8">
            <Loader size="sm" />
          </div>
        ) : (
          <div className="py-2">
            {visibleRevisions.length === 0 ? (
              <Text size="sm" c="dimmed" ta="center" className="mt-4">
                {filter === REVISION_FILTER_NAMED
                  ? t('No named versions yet.')
                  : t('No revisions yet. Revisions are created each time you publish.')}
              </Text>
            ) : (
              dateGroups.map(({ label, items }) => (
                <div key={label} className="mb-3 space-y-1">
                  <Text size="xs" fw={600} c="dimmed" className="px-3 pb-1 uppercase tracking-wide">
                    {t(label)}
                  </Text>
                  {items.map((revision) => (
                    <RevisionItem
                      key={revision.id}
                      revision={revision}
                      isSelected={revision.id === selectedRevisionId}
                      isLatest={revision.id === latestRevisionId}
                      onClick={() => onRevisionSelect(revision)}
                      hasWritePermission={hasWritePermission}
                      onRestoreSuccess={handleRestoreSuccess}
                      onNameChanged={handleNameChanged}
                      contentType={contentType}
                      contentId={contentId}
                    />
                  ))}
                </div>
              ))
            )}
          </div>
        )}
      </ScrollArea>

      {/* Highlight changes toggle — Google Docs style, always visible at panel bottom */}
      <div className="flex-shrink-0 px-4 py-3 border-t border-gray-200">
        <Checkbox
          checked={showDiff}
          onChange={(e) => onShowDiffChange(e.currentTarget.checked)}
          label={t('Highlight changes')}
          size="sm"
        />
      </div>
    </div>
  );
}
