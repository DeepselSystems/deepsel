import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Card from '../../../common/ui/Card.jsx';
import TextInput from '../../../common/ui/TextInput.jsx';
import H1 from '../../../common/ui/H1.jsx';
import EditFormActionBar from '../../../common/ui/EditFormActionBar.jsx';
import FormViewSkeleton from '../../../common/ui/FormViewSkeleton.jsx';
import useModel from '../../../common/api/useModel.jsx';
import NotificationState from '../../../common/stores/NotificationState.js';
import PasswordInput from '../../../common/ui/PasswordInput.jsx';
import Switch from '../../../common/ui/Switch.jsx';
import OrganizationIdState from '../../../common/stores/OrganizationIdState.js';
import useShowSiteSelector from '../../../common/hooks/useShowSiteSelector.js';

export default function SMTPSettings() {
  useShowSiteSelector();
  const { t } = useTranslation();
  const { organizationId } = OrganizationIdState();
  const query = useModel('organization', {
    id: organizationId,
    autoFetch: !!organizationId,
  });
  const { record, setRecord, update, loading: orgLoading } = query;
  const { notify } = NotificationState();

  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    try {
      e.preventDefault();
      setSubmitting(true);
      await update(record);
      notify({
        message: t('Saved!'),
        type: 'success',
      });
    } catch (error) {
      console.error(error);
      notify({
        message: error.message,
        type: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (!organizationId) {
    return (
      <div className={`max-w-screen-xl m-auto my-[20px] px-[24px]`}>
        <Card className={`shadow-none border-none text-center p-8`}>
          <H1>{t('Email Settings')}</H1>
          <div className="mt-4 text-gray-500">
            {t('Please select a website from the dropdown above to manage its settings.')}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <form className={`max-w-screen-xl m-auto my-[20px] px-[24px]`} onSubmit={handleSubmit}>
      <EditFormActionBar loading={submitting || orgLoading} />

      {record ? (
        <Card className={`shadow-none border-none`}>
          <H1>{t('Email Settings')}</H1>
          {/*Main content with left and right sections*/}
          <div className={`flex gap-16 my-2 mt-10`}>
            {/* Left section - SMTP Settings */}
            <div className={`flex gap-2 flex-col max-w-[300px]`}>
              <h3 className="text-lg font-semibold text-gray-700 mb-4">{t('SMTP Settings')}</h3>
              <TextInput
                label={t('SMTP Server')}
                value={record.mail_server || ''}
                onChange={(e) =>
                  setRecord({
                    ...record,
                    mail_server: e.target.value,
                  })
                }
              />
              <TextInput
                label={t('SMTP Port')}
                value={record.mail_port || ''}
                onChange={(e) =>
                  setRecord({
                    ...record,
                    mail_port: e.target.value,
                  })
                }
              />
              <TextInput
                label={t('SMTP Username')}
                value={record.mail_username || ''}
                onChange={(e) =>
                  setRecord({
                    ...record,
                    mail_username: e.target.value,
                  })
                }
              />
              <PasswordInput
                label={t('SMTP Password')}
                value={record.mail_password || ''}
                onChange={(e) =>
                  setRecord({
                    ...record,
                    mail_password: e.target.value,
                  })
                }
              />
              <TextInput
                label={t('From Name')}
                value={record.mail_from_name || ''}
                onChange={(e) =>
                  setRecord({
                    ...record,
                    mail_from_name: e.target.value,
                  })
                }
              />
              <TextInput
                label={t('From Email')}
                value={record.mail_from || ''}
                onChange={(e) =>
                  setRecord({
                    ...record,
                    mail_from: e.target.value,
                  })
                }
                type="email"
              />
              <Switch
                className={`my-2`}
                label={t('Validate Certificates')}
                checked={record.mail_validate_certs || false}
                onChange={(e) =>
                  setRecord({
                    ...record,
                    mail_validate_certs: e.currentTarget.checked,
                  })
                }
              />
              <Switch
                className={`my-2`}
                label={t('Use Credentials')}
                checked={record.mail_use_credentials || false}
                onChange={(e) =>
                  setRecord({
                    ...record,
                    mail_use_credentials: e.currentTarget.checked,
                  })
                }
              />
              <Switch
                className={`my-2`}
                label={t('SSL/TLS')}
                checked={record.mail_ssl_tls || false}
                onChange={(e) =>
                  setRecord({
                    ...record,
                    mail_ssl_tls: e.currentTarget.checked,
                  })
                }
              />
              <Switch
                className={`my-2`}
                label={t('STARTTLS')}
                checked={record.mail_starttls || false}
                onChange={(e) =>
                  setRecord({
                    ...record,
                    mail_starttls: e.currentTarget.checked,
                  })
                }
              />
            </div>

            {/* Right section - Send Rate Limit */}
            <div className={`flex gap-2 flex-col max-w-[300px]`}>
              <h3 className="text-lg font-semibold text-gray-700 mb-4">{t('Send Rate Limit')}</h3>
              <TextInput
                label={t('Send Rate Limit - Per Hour')}
                value={record.mail_send_rate_limit_per_hour || ''}
                onChange={(e) =>
                  setRecord({
                    ...record,
                    mail_send_rate_limit_per_hour: e.target.value,
                  })
                }
                type="number"
                min="0"
                placeholder="200"
                description={t('Maximum emails per hour. Set to 0 for unlimited sending.')}
              />
            </div>
          </div>
        </Card>
      ) : (
        <FormViewSkeleton />
      )}
    </form>
  );
}
