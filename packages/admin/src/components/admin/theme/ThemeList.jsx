import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Alert, Card, Badge, SimpleGrid, Loader, Text, Tooltip } from '@mantine/core';
import { modals } from '@mantine/modals';
import H1 from '../../../common/ui/H1.jsx';
import Button from '../../../common/ui/Button.jsx';
import BackendHostURLState from '../../../common/stores/BackendHostURLState.js';
import useAuthentication from '../../../common/api/useAuthentication.js';
import SitePublicSettingsState from '../../../common/stores/SitePublicSettingsState.js';
import OrganizationIdState from '../../../common/stores/OrganizationIdState.js';
import NotificationState from '../../../common/stores/NotificationState.js';
import { fetchPublicSettings } from '../../../utils/pageUtils.js';
import {
  IconAlertTriangle,
  IconCheck,
  IconDownload,
  IconEdit,
  IconPalette,
  IconRotate2,
} from '@tabler/icons-react';
import useShowSiteSelector from '../../../common/hooks/useShowSiteSelector.js';

export default function ThemeList() {
  useShowSiteSelector();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { backendHost } = BackendHostURLState();
  const { user } = useAuthentication();
  const { settings: siteSettings, setSettings } = SitePublicSettingsState();
  const { organizationId } = OrganizationIdState();
  const { notify } = NotificationState((state) => state);
  const [themes, setThemes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectingTheme, setSelectingTheme] = useState(null);
  const [downloadingTheme, setDownloadingTheme] = useState(null);
  const [resettingTheme, setResettingTheme] = useState(null);
  const [rebuilding, setRebuilding] = useState(false);

  useEffect(() => {
    fetchThemes();
  }, [organizationId, siteSettings?.selected_theme]);

  const fetchThemes = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${backendHost}/theme/list`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`,
          ...(organizationId ? { 'X-Organization-Id': String(organizationId) } : {}),
        },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch themes: ${response.statusText}`);
      }

      const data = await response.json();
      setThemes(data);
    } catch (err) {
      console.error('Error fetching themes:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadTheme = async (folderName) => {
    try {
      setDownloadingTheme(folderName);
      const response = await fetch(`${backendHost}/theme/download/${folderName}`, {
        headers: {
          Authorization: `Bearer ${user.token}`,
          ...(organizationId ? { 'X-Organization-Id': String(organizationId) } : {}),
        },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Failed to download theme: ${response.statusText}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${folderName}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error downloading theme:', err);
      notify({
        message: err.message,
        type: 'error',
      });
    } finally {
      setDownloadingTheme(null);
    }
  };

  const pollBuildStatus = () => {
    return new Promise((resolve, reject) => {
      const interval = setInterval(async () => {
        try {
          const res = await fetch(`${backendHost}/theme/build-status`, {
            headers: {
              Authorization: `Bearer ${user.token}`,
              ...(organizationId ? { 'X-Organization-Id': String(organizationId) } : {}),
            },
            credentials: 'include',
          });
          if (!res.ok) {
            clearInterval(interval);
            reject(new Error('Failed to check build status'));
            return;
          }
          const status = await res.json();
          if (status.status === 'idle') {
            clearInterval(interval);
            resolve();
          } else if (status.status === 'error') {
            clearInterval(interval);
            reject(new Error(status.error || 'Build failed'));
          }
        } catch (err) {
          clearInterval(interval);
          reject(err);
        }
      }, 2000);

      // Safety timeout: stop polling after 5 minutes
      setTimeout(() => {
        clearInterval(interval);
        reject(new Error('Build timed out'));
      }, 300000);
    });
  };

  const handleSelectTheme = async (folderName) => {
    try {
      setSelectingTheme(folderName);

      const response = await fetch(`${backendHost}/theme/select`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(organizationId ? { 'X-Organization-Id': String(organizationId) } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ folder_name: folderName, organization_id: organizationId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to select theme');
      }

      const data = await response.json();

      if (data.rebuilding) {
        setSelectingTheme(null);
        setRebuilding(true);
        await pollBuildStatus();
      }

      // Refresh site settings to get updated selected_theme for this org
      const updatedSettings = await fetchPublicSettings(organizationId);
      if (updatedSettings) {
        setSettings(updatedSettings);
      }

      notify({
        message: data.message || t('Theme selected successfully'),
        type: 'success',
      });
    } catch (err) {
      console.error('Error selecting theme:', err);
      notify({
        message: err.message,
        type: 'error',
      });
    } finally {
      setSelectingTheme(null);
      setRebuilding(false);
    }
  };

  const handleResetTheme = (folderName) => {
    modals.openConfirmModal({
      title: t('Reset Theme to Default'),
      children: (
        <Text size="sm">
          {t(
            'This will reset all theme file edits to the original defaults. This action cannot be undone.',
          )}
        </Text>
      ),
      labels: { confirm: t('Reset'), cancel: t('Cancel') },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          setResettingTheme(folderName);
          const response = await fetch(`${backendHost}/theme/reset`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${user.token}`,
              ...(organizationId ? { 'X-Organization-Id': String(organizationId) } : {}),
            },
            credentials: 'include',
            body: JSON.stringify({ folder_name: folderName }),
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Failed to reset theme');
          }

          const data = await response.json();
          notify({
            message: data.message || t('Theme reset successfully'),
            type: 'success',
          });
        } catch (err) {
          console.error('Error resetting theme:', err);
          notify({ message: err.message, type: 'error' });
        } finally {
          setResettingTheme(null);
        }
      },
    });
  };

  return (
    <>
      <Helmet>
        <title>Themes</title>
      </Helmet>
      <main className="h-[calc(100vh-50px-32px-20px)] flex flex-col m-auto px-[12px] sm:px-[24px]">
        <div className="flex w-full justify-between gap-2 my-3">
          <H1 className="text-[32px] font-bold text-primary">{t('Themes')}</H1>
        </div>

        {rebuilding && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-8 flex flex-col items-center gap-4 shadow-xl">
              <Loader size="xl" />
              <Text size="lg" fw={600}>
                {t('Rebuilding site with new theme...')}
              </Text>
              <Text size="sm" c="dimmed">
                {t('This may take a minute. Please wait.')}
              </Text>
            </div>
          </div>
        )}

        {error && (
          <Alert
            color="red"
            variant="light"
            title="Error"
            className="mb-4"
            icon={<IconAlertTriangle size={16} />}
          >
            {error}
          </Alert>
        )}

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <Loader size="lg" />
          </div>
        ) : themes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <IconPalette size={64} className="mb-4 opacity-50" />
            <p className="text-lg">{t('No themes found')}</p>
          </div>
        ) : (
          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
            {themes.map((theme) => {
              const isSelected = siteSettings?.selected_theme === theme.folder_name;
              const isSelecting = selectingTheme === theme.folder_name;

              return (
                <Card
                  key={theme.folder_name}
                  shadow="sm"
                  padding={0}
                  radius="md"
                  withBorder
                  className={`hover:shadow-md transition-shadow ${isSelected ? 'border-green-500 border-2' : ''}`}
                >
                  {/* Preview image */}
                  {theme.image && (
                    <div className="w-full h-[180px] bg-gray-100 overflow-hidden">
                      <img
                        src={`${backendHost}/theme/preview-image/${theme.folder_name}/${theme.image}`}
                        alt={theme.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.target.style.display = 'none';
                        }}
                      />
                    </div>
                  )}

                  <div className="flex flex-col h-full p-4">
                    <div className="mb-2">
                      <h3 className="text-lg font-semibold text-gray-900 mb-1">{theme.name}</h3>
                      <div className="flex gap-2 items-center">
                        <Badge color="blue" variant="light" size="sm">
                          v{theme.version}
                        </Badge>
                        {isSelected && (
                          <Badge
                            color="green"
                            variant="filled"
                            size="sm"
                            leftSection={<IconCheck size={12} />}
                          >
                            {t('Selected')}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Description */}
                    {theme.description && (
                      <p className="text-sm text-gray-600 mb-3 line-clamp-3">{theme.description}</p>
                    )}

                    <div className="mt-auto flex gap-2">
                      {isSelected && (
                        <>
                          <Button
                            onClick={() => navigate(`/themes/edit/${theme.folder_name}`)}
                            variant="outline"
                            className="flex-1"
                          >
                            <IconEdit size={16} className="mr-2" />
                            {t('Edit')}
                          </Button>
                          <Tooltip label={t('Reset to Default')}>
                            <Button
                              onClick={() => handleResetTheme(theme.folder_name)}
                              disabled={resettingTheme === theme.folder_name}
                              loading={resettingTheme === theme.folder_name}
                              variant="outline"
                              color="red"
                            >
                              <IconRotate2 size={16} />
                            </Button>
                          </Tooltip>
                        </>
                      )}
                      {!isSelected && (
                        <Button
                          onClick={() => handleSelectTheme(theme.folder_name)}
                          disabled={isSelecting}
                          loading={isSelecting}
                          className="flex-1"
                        >
                          {t('Select Theme')}
                        </Button>
                      )}
                      <Tooltip label={t('Download')}>
                        <Button
                          onClick={() => handleDownloadTheme(theme.folder_name)}
                          disabled={downloadingTheme === theme.folder_name}
                          loading={downloadingTheme === theme.folder_name}
                          variant="outline"
                        >
                          <IconDownload size={16} />
                        </Button>
                      </Tooltip>
                    </div>
                  </div>
                </Card>
              );
            })}
          </SimpleGrid>
        )}
      </main>
    </>
  );
}
