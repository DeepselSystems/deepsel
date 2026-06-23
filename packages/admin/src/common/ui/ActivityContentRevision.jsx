import { useState } from 'react';
import { Button, Spoiler, Stack, Alert } from '@mantine/core';
import { modals } from '@mantine/modals';
import NotificationState from '../stores/NotificationState.js';
import dayjs from 'dayjs';
import { Preferences } from '@capacitor/preferences';
import BackendHostURLState from '../stores/BackendHostURLState.js';
import { IconAlertTriangle, IconArrowBack } from '@tabler/icons-react';

function RevisionItem({ revision, hasWritePermission, onRestore, loading }) {
  const sanitizeHtml = (html) => {
    if (!html) return '';
    // Basic sanitization - remove script tags and dangerous attributes
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/on\w+="[^"]*"/g, '')
      .replace(/javascript:/gi, '');
  };

  return (
    <div className="bg-white border border-gray-300 rounded-lg p-4 mb-4 shadow-sm hover:shadow-md transition-shadow">
      {/* Header with revision info */}
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
            <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-900">
              {revision.name || 'Content update'}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              <span>{dayjs.utc(revision.created_at).local().fromNow()}</span>
            </div>
          </div>
        </div>
        <div className="text-xs text-gray-400 font-mono">
          #{revision.revision_number || revision.id}
        </div>
      </div>

      {/* New content (what was changed to) */}
      {revision.new_content && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-4 h-4 bg-green-100 rounded flex items-center justify-center">
              <div className="w-2 h-2 bg-green-500 rounded"></div>
            </div>
            <div className="text-xs font-semibold text-green-700 uppercase tracking-wide">
              New Content
            </div>
          </div>
          <Spoiler maxHeight={60} showLabel="..." hideLabel="Less">
            <div
              className="bg-green-50 border-l-4 border-green-400 rounded-r p-3 text-sm"
              dangerouslySetInnerHTML={{
                __html: sanitizeHtml(revision.new_content),
              }}
            />
          </Spoiler>
        </div>
      )}

      {/* Old content (what can be restored to) */}
      {revision.old_content && (
        <div>
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-orange-100 rounded flex items-center justify-center">
                <div className="w-2 h-2 bg-orange-500 rounded"></div>
              </div>
              <div className="text-xs font-semibold text-orange-700 uppercase tracking-wide">
                Previous Content
              </div>
            </div>
            {hasWritePermission && (
              <Button
                size="xs"
                variant="filled"
                leftSection={<IconArrowBack size={16} />}
                onClick={() => onRestore(revision)}
                loading={loading}
              >
                Restore
              </Button>
            )}
          </div>
          <Spoiler maxHeight={60} showLabel="..." hideLabel="Less">
            <div
              className="bg-orange-50 border-l-4 border-orange-400 rounded-r p-3 text-sm"
              dangerouslySetInnerHTML={{
                __html: sanitizeHtml(revision.old_content),
              }}
            />
          </Spoiler>
        </div>
      )}
    </div>
  );
}

export default function ActivityContentRevision({
  revisions = [],
  contentType,
  contentId,
  currentLanguage,
  hasWritePermission = false,
  onContentRestored,
}) {
  const [loading, setLoading] = useState(false);
  const { notify } = NotificationState();

  const handleRestore = async (revision) => {
    if (!hasWritePermission) {
      notify({
        message: 'You do not have permission to restore content',
        type: 'error',
      });
      return;
    }

    modals.openConfirmModal({
      title: 'Restore Content',
      children: (
        <Stack spacing="md">
          <Alert icon={<IconAlertTriangle size={16} />}>
            <div className="text-sm">
              Restore content for <strong>{currentLanguage}</strong> to this point? This action will
              replace the existing content.
            </div>
          </Alert>
        </Stack>
      ),
      labels: { confirm: 'Restore', cancel: 'Cancel' },
      onConfirm: () => performRestore(revision),
    });
  };

  const performRestore = async (revision) => {
    setLoading(true);
    try {
      // Get auth token
      const tokenResult = await Preferences.get({ key: 'token' });
      const headers = {
        'Content-Type': 'application/json',
      };

      if (tokenResult?.value) {
        headers.Authorization = `Bearer ${tokenResult.value}`;
      }

      const orgId = parseInt(localStorage.getItem('organizationId') || '', 10);
      if (Number.isFinite(orgId)) {
        headers['X-Organization-Id'] = String(orgId);
      }

      // Make fetch request to restore endpoint
      const backendHost = BackendHostURLState.getState().backendHost;
      const response = await fetch(`${backendHost}/revision/restore`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          content_type: contentType,
          content_id: contentId,
          revision_id: revision.id,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error?.detail || 'Failed to restore content');
      }

      notify({
        message: 'Content restored successfully',
        type: 'success',
      });

      if (onContentRestored) {
        console.log('Calling onContentRestored callback...');
        await onContentRestored();
        console.log('onContentRestored callback completed');
      }
    } catch (error) {
      notify({
        message: error.message || 'Failed to restore content',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  if (!revisions?.length) {
    return (
      <div className="p-4 text-center">
        <div className="text-sm text-gray-500">No revision history available</div>
      </div>
    );
  }

  return (
    <div>
      {revisions.map((revision) => (
        <RevisionItem
          key={revision.id}
          revision={revision}
          hasWritePermission={hasWritePermission}
          onRestore={handleRestore}
          loading={loading}
        />
      ))}
    </div>
  );
}
