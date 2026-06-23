import { useTranslation } from 'react-i18next';
import Card from '../../../common/ui/Card.jsx';
import TextInput from '../../../common/ui/TextInput.jsx';
import H1 from '../../../common/ui/H1.jsx';
import useModel from '../../../common/api/useModel.jsx';
import NotificationState from '../../../common/stores/NotificationState.js';
import { Link, useNavigate } from 'react-router-dom';
import FormViewSkeleton from '../../../common/ui/FormViewSkeleton.jsx';
import EditFormActionBar from '../../../common/ui/EditFormActionBar.jsx';
import H2 from '../../../common/ui/H2.jsx';
import { Menu, LoadingOverlay } from '@mantine/core';
import useAuthentication from '../../../common/api/useAuthentication.js';
// import backendHost from "../../constants/backendHost.js";
import { useState } from 'react';
import BackendHostURLState from '../../../common/stores/BackendHostURLState.js';
import { Switch, Collapse } from '@mantine/core';
import Button from '../../../common/ui/Button.jsx';
import {
  IconArrowRight,
  IconBoxMultiple,
  IconCube,
  IconFileImport,
  IconLock,
  IconServer,
  IconSettings,
} from '@tabler/icons-react';

export default function OrganizationSettings() {
  const { t } = useTranslation();
  const query = useModel('organization', {
    id: 1,
    autoFetch: true,
  });
  const { record, setRecord, update, loading: orgLoading } = query;
  const { notify } = NotificationState((state) => state);
  const navigate = useNavigate();
  const { user } = useAuthentication();
  const { backendHost, setBackendHost, resetDefault } = BackendHostURLState((state) => state);
  const [demoDataLoading, setDemoDataLoading] = useState(false);
  const loading = orgLoading || demoDataLoading;
  const [showTechnical, setShowTechnical] = useState(false);
  const [newBackendHost, setNewBackendHost] = useState(backendHost);
  const { data: apps } = useModel('apps', {
    autoFetch: true,
  });

  async function handleSubmit(e) {
    try {
      e.preventDefault();
      await Promise.all([update(record)]);
      if (newBackendHost !== backendHost) {
        setBackendHost(newBackendHost);
      }
      notify({
        message: t('Organization Settings updated successfully!'),
        type: 'success',
      });
      navigate(-1);
    } catch (error) {
      console.error(error);
      notify({
        message: error.message,
        type: 'error',
      });
    }
  }

  async function loadDemoData(app) {
    try {
      setDemoDataLoading(true);
      const headers = {
        Authorization: `Bearer ${user.token}`,
      };
      const res = await fetch(`${backendHost}/apps/load_demo_data/${app.name}`, {
        method: 'POST',
        headers,
      });
      if (res.status !== 200) {
        const { detail } = await res.json();
        console.error(detail);
        return notify({
          message: detail,
          type: 'error',
        });
      }
      notify({
        message: t('Demo data loaded successfully!'),
        type: 'success',
      });
    } catch (e) {
      console.error(e);
      notify({
        message: e.message,
        type: 'error',
      });
    } finally {
      setDemoDataLoading(false);
    }
  }

  function resetDefaultBackendHost() {
    resetDefault();
    setNewBackendHost(backendHost);
  }

  return (
    <form className={`max-w-screen-xl m-auto my-[20px] px-[24px]`} onSubmit={handleSubmit}>
      <EditFormActionBar loading={loading} />

      {record ? (
        <Card className={`shadow-none border-none`}>
          <H1>{record.name}</H1>
          {/*Row 1*/}
          <div className={`flex gap-2 my-2`}>
            {/*Column 1*/}
            <div className={`flex flex-col grow max-w-screen-xl gap-2`}>
              <TextInput
                label={t('Display name')}
                description={t(`Your organization's name`)}
                placeholder={t('My Organization')}
                required
                value={record.name}
                onChange={(e) =>
                  setRecord({
                    ...record,
                    name: e.target.value,
                  })
                }
              />
            </div>
          </div>

          <div className={`mt-6 flex flex-col gap-4`}>
            <div className="flex items-center gap-2">
              <IconLock size={16} className="text-gray-600" />
              <H2 className={``}>{t('Authentication')}</H2>
            </div>
            <Switch
              label={t('Enable Authentication')}
              description={t(
                'In authless mode, enable this to require authentication. In normal mode, authentication is always required regardless of this setting.',
              )}
              className={`cursor-pointer`}
              checked={record.enable_auth}
              onChange={(e) =>
                setRecord({
                  ...record,
                  enable_auth: e.target.checked,
                })
              }
            />
            <TextInput
              className="w-[250px]"
              label={t('Access Token Expiry Time (minutes)')}
              value={record.access_token_expire_minutes}
              type="number"
              placeholder={t('Access Token Expiry Time (minutes)')}
              onChange={(e) =>
                setRecord({
                  ...record,
                  access_token_expire_minutes: e.target.value,
                })
              }
            />
            <Switch
              label={t('Require Two-Factor-Authentication for all users')}
              className={`cursor-pointer`}
              checked={record.require_2fa_all_users}
              onChange={(e) =>
                setRecord({
                  ...record,
                  require_2fa_all_users: e.target.checked,
                })
              }
            />
            <Switch
              label={t('Allow public signup')}
              className={`cursor-pointer`}
              checked={record.allow_public_signup}
              onChange={(e) =>
                setRecord({
                  ...record,
                  allow_public_signup: e.target.checked,
                })
              }
            />
            <Link to="/site-settings/authentication" className="flex items-center gap-2 my-3">
              <div
                className="cursor-pointer underline"
                style={{
                  fontSize: `var(--input-label-size,var(--mantine-font-size-md))`,
                  fontWeight: 500,
                }}
              >
                Configure Google Sign-In
              </div>
              <IconArrowRight size={16} className="ml-1" />
            </Link>
          </div>

          <div className={`mt-4 flex gap-2 items-center`}>
            <IconServer size={16} className="text-gray-600" />
            <H2 className={``}>{t('Technical Settings')}</H2>
            <div>
              <Switch
                className={`cursor-pointer`}
                checked={showTechnical}
                onChange={(e) => setShowTechnical(e.currentTarget.checked)}
              />
            </div>
          </div>

          <Collapse in={showTechnical}>
            <div className={`flex gap-2 my-2 items-end`}>
              <TextInput
                className={`w-[400px]`}
                label={t('Server URL')}
                placeholder={t('https://example.com/api')}
                required
                value={newBackendHost}
                onChange={(e) => setNewBackendHost(e.target.value)}
              />
              <Button variant={`outline`} onClick={resetDefaultBackendHost}>
                {t('Reset default')}
              </Button>
            </div>

            <div className="flex items-center gap-2 mt-4">
              <IconBoxMultiple size={16} className="text-gray-600" />
              <H2>{t('Installed Business Apps')}</H2>
            </div>
            <div className={`relative flex gap-4 my-2 flex-wrap text-primary-main`}>
              <LoadingOverlay
                visible={loading}
                zIndex={1000}
                overlayProps={{
                  radius: 'sm',
                  blur: 2,
                }}
                loaderProps={{
                  type: 'bars',
                }}
              />
              {apps?.map((app) => (
                <div
                  key={app.name}
                  className={`rounded-lg bg-gray-50 p-2 text-xs uppercase font-semibold shadow border border-gray-border w-[180px] h-[100px]`}
                >
                  <div className={`flex justify-between items-center`}>
                    <div>
                      <IconCube size={16} className="mr-1" />
                      {app.name}
                    </div>
                    <Menu shadow="md" width={180}>
                      <Menu.Target>
                        <IconSettings size={16} className="cursor-pointer" />
                      </Menu.Target>

                      <Menu.Dropdown>
                        <Menu.Item onClick={() => loadDemoData(app)}>
                          <IconFileImport size={16} className="mr-1.5" />
                          {t('Load demo data')}
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </div>
                </div>
              ))}
            </div>
          </Collapse>
        </Card>
      ) : (
        <FormViewSkeleton />
      )}
    </form>
  );
}
