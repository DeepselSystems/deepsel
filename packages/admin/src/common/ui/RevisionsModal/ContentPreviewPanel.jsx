import { Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { RevisionContentRenderer } from './RevisionContentRenderer.jsx';

/**
 * Left panel of RevisionsModal.
 * Renders the selected revision's content (Jinja2-processed HTML, optionally diff-highlighted).
 * Shows a placeholder when no revision is selected.
 * Revision info (name, timestamp, author) is shown in the shared modal header above.
 * @param {object} props
 * @param {import('../../../typedefs/Revision').ContentRevision | null} props.selectedRevision
 * @param {'page'|'blog'} props.contentType - Content type, forwarded to the content renderer
 * @param {boolean} props.showDiff - Whether diff highlighting is active (owned by RevisionsModal)
 */
export function ContentPreviewPanel({ selectedRevision, contentType, showDiff }) {
  // Translation
  const { t } = useTranslation();

  // No revision selected
  if (!selectedRevision) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Text size="xl" fw={600} c="dimmed" mb="xs">
            {t('Content Preview')}
          </Text>
          <Text size="sm" c="dimmed">
            {t('Select a revision on the right to preview its content.')}
          </Text>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      <RevisionContentRenderer
        selectedRevision={selectedRevision}
        contentType={contentType}
        showDiff={showDiff}
      />
    </div>
  );
}
