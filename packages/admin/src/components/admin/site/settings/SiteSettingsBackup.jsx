import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, FileInput, Group, Modal, Text } from '@mantine/core';
import { IconDownload, IconUpload } from '@tabler/icons-react';
import useAuthentication from '../../../../common/api/useAuthentication.js';
import NotificationState from '../../../../common/stores/NotificationState.js';
import BackendHostURLState from '../../../../common/stores/BackendHostURLState.js';
import SiteSettingsSection from './SiteSettingsSection.jsx';

export default function SiteSettingsBackup() {
  const { t } = useTranslation();
  const { user } = useAuthentication();
  const { backendHost } = BackendHostURLState();
  const { notify } = NotificationState((state) => state);

  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  const handleExport = async (organizationId) => {
    try {
      if (!organizationId) {
        notify({
          message: t('No organization selected'),
          type: 'error',
        });
        return;
      }

      setExportLoading(true);

      notify({
        message: t('Starting backup download...'),
        type: 'info',
      });

      const response = await fetch(
        `${backendHost}/backup/export?organization_id=${organizationId}`,
        {
          headers: {
            Authorization: `Bearer ${user?.token}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error('Export failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      notify({
        message: t('Backup downloaded successfully!'),
        type: 'success',
      });
    } catch (error) {
      console.error(error);
      notify({
        message: t('Failed to download backup'),
        type: 'error',
      });
    } finally {
      setExportLoading(false);
    }
  };

  const handleImport = async (organizationId) => {
    if (!importFile) return;
    if (!organizationId) {
      notify({
        message: t('No organization selected'),
        type: 'error',
      });
      return;
    }

    try {
      setImportLoading(true);
      const formData = new FormData();
      formData.append('file', importFile);
      formData.append('organization_id', organizationId);

      const response = await fetch(`${backendHost}/backup/import`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${user?.token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Import failed');
      }

      const result = await response.json();

      if (result.errors && result.errors.length > 0) {
        notify({
          message: 'Import incompleted with some errors.',
          type: 'warning',
          autoClose: 10000,
        });
      } else {
        notify({
          message: t('Backup restored successfully!'),
          type: 'success',
        });
      }

      setImportModalOpen(false);
      setImportFile(null);
    } catch (error) {
      console.error(error);
      notify({
        message: 'Failed to import backup',
        type: 'error',
      });
    } finally {
      setImportLoading(false);
    }
  };

  return (
    <SiteSettingsSection title={t('Backup & Restore')} showActionBar={false}>
      {({ organizationId }) => (
        <>
          <Text c="dimmed" size="sm" className="mb-4">
            {t(
              'Export your site content (Pages, Blog Posts, Menus, Attachments) as a ZIP file or restore from a previous backup.',
            )}
          </Text>

          <div className="flex gap-4">
            <Button
              leftSection={<IconDownload size={16} />}
              onClick={() => handleExport(organizationId)}
              variant="outline"
              loading={exportLoading}
            >
              {t('Download Backup')}
            </Button>

            <Button
              leftSection={<IconUpload size={16} />}
              onClick={() => setImportModalOpen(true)}
              variant="outline"
              color="red"
            >
              {t('Restore Backup')}
            </Button>
          </div>

          <Modal
            opened={importModalOpen}
            onClose={() => {
              setImportModalOpen(false);
              setImportFile(null);
            }}
            title={t('Restore Backup')}
            centered
          >
            <div className="flex flex-col gap-4">
              <Alert color="red" title={t('Warning')}>
                {t(
                  'Restoring a backup will overwrite existing content with the same IDs. This action cannot be undone. Please make sure you have a current backup before proceeding.',
                )}
              </Alert>

              <FileInput
                label={t('Backup File (.zip)')}
                placeholder={t('Select backup file')}
                accept=".zip"
                value={importFile}
                onChange={setImportFile}
                required
              />

              <Group justify="flex-end" mt="md">
                <Button
                  variant="default"
                  onClick={() => {
                    setImportModalOpen(false);
                    setImportFile(null);
                  }}
                >
                  {t('Cancel')}
                </Button>
                <Button
                  color="red"
                  onClick={() => handleImport(organizationId)}
                  loading={importLoading}
                  disabled={!importFile}
                >
                  {t('Restore')}
                </Button>
              </Group>
            </div>
          </Modal>
        </>
      )}
    </SiteSettingsSection>
  );
}
