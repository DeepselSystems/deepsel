import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Group, Modal, TextInput as MantineTextInput } from '@mantine/core';
import { IconAlertTriangle, IconTrash } from '@tabler/icons-react';
import H2 from '../../../../common/ui/H2.jsx';
import BackendHostURLState from '../../../../common/stores/BackendHostURLState.js';
import NotificationState from '../../../../common/stores/NotificationState.js';
import useAuthentication from '../../../../common/api/useAuthentication.js';

export default function DeleteSiteSection({ record, organizationId }) {
  const { t } = useTranslation();
  const { backendHost } = BackendHostURLState();
  const { notify } = NotificationState((s) => s);
  const { logout } = useAuthentication();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [loading, setLoading] = useState(false);

  const expected = record?.name || '';
  const canDelete = typed.trim() === expected && expected.length > 0;

  async function handleDelete() {
    setLoading(true);
    try {
      const res = await fetch(`${backendHost}/organization/${organizationId}?force=true`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      notify({ message: t('Site deleted'), type: 'success' });
      try {
        await logout();
      } catch {
        /* org users are gone; logout call may 401 — ignore */
      }
      window.location.href = '/admin/login';
    } catch (e) {
      notify({ message: e.message, type: 'error' });
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 border-t border-red-200 pt-8 mt-4">
      <div className="flex items-center gap-2">
        <IconAlertTriangle size={16} className="text-red-600" />
        <H2>{t('Danger Zone')}</H2>
      </div>

      <Alert color="red" title={t('Delete this site')}>
        {t(
          'Permanently delete this site and all associated content: pages, blog posts, media, users, and settings. This cannot be undone.',
        )}
      </Alert>

      <div>
        <Button
          type="button"
          color="red"
          variant="outline"
          leftSection={<IconTrash size={16} />}
          onClick={() => {
            setTyped('');
            setOpen(true);
          }}
        >
          {t('Delete site')}
        </Button>
      </div>

      <Modal
        opened={open}
        onClose={() => {
          if (!loading) setOpen(false);
        }}
        title={t('Delete site')}
        centered
      >
        <div className="flex flex-col gap-4">
          <Alert color="red" title={t('This is irreversible')}>
            {t(
              'All site content will be permanently deleted. You will be logged out after deletion.',
            )}
          </Alert>

          <MantineTextInput
            label={t('Type the site name to confirm')}
            description={expected}
            value={typed}
            onChange={(e) => setTyped(e.currentTarget.value)}
            placeholder={expected}
            autoFocus
          />

          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={() => setOpen(false)} disabled={loading}>
              {t('Cancel')}
            </Button>
            <Button color="red" onClick={handleDelete} loading={loading} disabled={!canDelete}>
              {t('Delete site')}
            </Button>
          </Group>
        </div>
      </Modal>
    </div>
  );
}
