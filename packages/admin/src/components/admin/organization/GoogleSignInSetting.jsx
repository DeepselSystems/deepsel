import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import useModel from '../../../common/api/useModel.jsx';
import BackendHostURLState from '../../../common/stores/BackendHostURLState.js';
import NotificationState from '../../../common/stores/NotificationState.js';
import Card from '../../../common/ui/Card.jsx';
import EditFormActionBar from '../../../common/ui/EditFormActionBar.jsx';
import FormViewSkeleton from '../../../common/ui/FormViewSkeleton.jsx';
import H1 from '../../../common/ui/H1.jsx';
import PasswordInput from '../../../common/ui/PasswordInput.jsx';
import Switch from '../../../common/ui/Switch.jsx';
import TextInput from '../../../common/ui/TextInput.jsx';
import { IconCopy, IconRotate } from '@tabler/icons-react';

export default function GoogleSignInSetting() {
  const { t } = useTranslation();
  const { backendHost } = BackendHostURLState((state) => state);
  const { record, setRecord, update, loading } = useModel('organization', {
    id: 1,
    autoFetch: true,
  });
  const { notify } = NotificationState();

  useEffect(() => {
    if (record?.is_enabled_google_sign_in && !record.google_redirect_uri) {
      update({
        ...record,
        google_redirect_uri: `${backendHost}/auth/google`,
      });
    }
  }, [backendHost, record, update]);

  async function handleSubmit(e) {
    try {
      e.preventDefault();
      if (!record.is_enabled_google_sign_in) {
        record.google_client_id = '';
        record.google_client_secret = '';
        record.google_redirect_uri = '';
      }
      const updatedRecord = await update(record);
      setRecord(updatedRecord);
      notify({
        message: t('Google Sign-In Settings updated successfully!'),
        type: 'success',
      });
    } catch (error) {
      console.error(error);
      notify({
        message: error.message,
        type: 'error',
      });
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(record.google_redirect_uri);
    notify({
      message: t('Copied to clipboard!'),
      type: 'success',
    });
  }

  function handleReset() {
    setRecord({
      ...record,
      google_redirect_uri: `${backendHost}/auth/google`,
    });
  }

  return (
    <form className={`max-w-screen-xl m-auto my-[20px] px-[24px]`} onSubmit={handleSubmit}>
      <EditFormActionBar loading={loading} />

      {record ? (
        <Card className={`shadow-none border-none`}>
          <H1>{t('Google Sign In Setting')}</H1>
          {/*Row 1*/}
          <div className={`flex gap-2 my-2 flex-col max-w-[600px]`}>
            <Switch
              className={`my-2`}
              label={t('Enable Google Sign-In')}
              checked={record.is_enabled_google_sign_in}
              onChange={(e) =>
                setRecord({
                  ...record,
                  is_enabled_google_sign_in: e.currentTarget.checked,
                })
              }
            />
            {record.is_enabled_google_sign_in && (
              <>
                <TextInput
                  label={t('Google Client Id')}
                  value={record.google_client_id || ''}
                  onChange={(e) =>
                    setRecord({
                      ...record,
                      google_client_id: e.target.value,
                    })
                  }
                />
                <PasswordInput
                  label={t('Google Client Secret')}
                  value={record.google_client_secret || ''}
                  onChange={(e) =>
                    setRecord({
                      ...record,
                      google_client_secret: e.target.value,
                    })
                  }
                />
                <TextInput
                  label={t('Google Redirect URI')}
                  placeholder={`https://example.com/auth/google`}
                  value={record.google_redirect_uri || ''}
                  onChange={(e) =>
                    setRecord({
                      ...record,
                      google_redirect_uri: e.target.value,
                    })
                  }
                  rightSection={
                    <div className="flex items-center gap-2 mr-6">
                      <button type="button" onClick={handleReset} title={t('Reset to default')}>
                        <IconRotate size={16} />
                      </button>
                      <button type="button" onClick={handleCopy} title={t('Copy to clipboard')}>
                        <IconCopy size={16} />
                      </button>
                    </div>
                  }
                  // readOnly
                  // className="[&_input]:cursor-not-allowed"
                />
              </>
            )}
          </div>
        </Card>
      ) : (
        <FormViewSkeleton />
      )}
    </form>
  );
}
