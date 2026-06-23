import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import useModel from '../../../common/api/useModel.jsx';
import BackendHostURLState from '../../../common/stores/BackendHostURLState.js';
import NotificationState from '../../../common/stores/NotificationState.js';
import Card from '../../../common/ui/Card.jsx';
import EditFormActionBar from '../../../common/ui/EditFormActionBar.jsx';
import FormViewSkeleton from '../../../common/ui/FormViewSkeleton.jsx';
import H1 from '../../../common/ui/H1.jsx';
import Switch from '../../../common/ui/Switch.jsx';
import TextArea from '../../../common/ui/TextArea.jsx';
import TextInput from '../../../common/ui/TextInput.jsx';
import H2 from '../../../common/ui/H2.jsx';
import { IconCopy, IconRotate } from '@tabler/icons-react';

export default function SamlSetting() {
  const { t } = useTranslation();
  const { backendHost } = BackendHostURLState((state) => state);
  const { record, setRecord, update, loading } = useModel('organization', {
    id: 1,
    autoFetch: true,
  });
  const { notify } = NotificationState();

  useEffect(() => {
    if (record?.is_enabled_saml && !record.saml_sp_entity_id) {
      update({
        ...record,
        saml_sp_entity_id: `${backendHost}/saml/metadata`,
        saml_sp_acs_url: `${backendHost}/auth/saml`,
        saml_sp_sls_url: `${backendHost}/sls/saml`,
      });
    }
  }, [backendHost, record, update]);

  async function handleSubmit(e) {
    try {
      e.preventDefault();
      if (!record.is_enabled_saml) {
        record.saml_idp_entity_id = '';
        record.saml_idp_sso_url = '';
        record.saml_idp_x509_cert = '';
        record.saml_sp_entity_id = '';
        record.saml_sp_acs_url = '';
        record.saml_sp_sls_url = '';
      }
      const updatedRecord = await update(record);
      setRecord(updatedRecord);
      notify({
        message: t('SAML Settings updated successfully!'),
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

  async function handleCopy(text) {
    await navigator.clipboard.writeText(text);
    notify({
      message: t('Copied to clipboard!'),
      type: 'success',
    });
  }

  function handleResetSP() {
    setRecord({
      ...record,
      saml_sp_entity_id: `${backendHost}/saml/metadata`,
      saml_sp_acs_url: `${backendHost}/auth/saml`,
      saml_sp_sls_url: `${backendHost}/sls/saml`,
    });
  }

  function handleAttributeMappingChange(field, value) {
    const mapping = record.saml_attribute_mapping || {};
    mapping[field] = value;
    setRecord({
      ...record,
      saml_attribute_mapping: mapping,
    });
  }

  return (
    <form className={`max-w-screen-xl m-auto my-[20px] px-[24px]`} onSubmit={handleSubmit}>
      <EditFormActionBar loading={loading} />

      {record ? (
        <Card className={`shadow-none border-none`}>
          <H1>{t('SAML Configuration')}</H1>

          <div className={`flex gap-2 my-2 flex-col max-w-[600px]`}>
            <Switch
              className={`my-2`}
              label={t('Enable SAML Authentication')}
              checked={record.is_enabled_saml}
              onChange={(e) =>
                setRecord({
                  ...record,
                  is_enabled_saml: e.currentTarget.checked,
                })
              }
            />

            {record.is_enabled_saml && (
              <>
                <H2>{t('Identity Provider (IdP) Configuration')}</H2>

                <TextInput
                  label={t('IdP Entity ID')}
                  placeholder="https://your-idp.com/saml/metadata"
                  value={record.saml_idp_entity_id || ''}
                  onChange={(e) =>
                    setRecord({
                      ...record,
                      saml_idp_entity_id: e.target.value,
                    })
                  }
                  required
                />

                <TextInput
                  label={t('IdP Single Sign-On URL')}
                  placeholder="https://your-idp.com/saml/sso"
                  value={record.saml_idp_sso_url || ''}
                  onChange={(e) =>
                    setRecord({
                      ...record,
                      saml_idp_sso_url: e.target.value,
                    })
                  }
                  required
                />

                <TextArea
                  label={t('IdP X.509 Certificate')}
                  placeholder="-----BEGIN CERTIFICATE-----
MIICXjCCAcegAwIBAgIBADANBgkqhkiG9w0BAQ0FADBLMQswCQYDVQQGEwJ1czE...
-----END CERTIFICATE-----"
                  value={record.saml_idp_x509_cert || ''}
                  onChange={(e) =>
                    setRecord({
                      ...record,
                      saml_idp_x509_cert: e.target.value,
                    })
                  }
                  rows={6}
                  required
                />

                <H2>{t('Service Provider (SP) Configuration')}</H2>

                <TextInput
                  label={t('SP Entity ID / Metadata URL')}
                  value={record.saml_sp_entity_id || ''}
                  onChange={(e) =>
                    setRecord({
                      ...record,
                      saml_sp_entity_id: e.target.value,
                    })
                  }
                  rightSection={
                    <div className="flex items-center gap-2 mr-6">
                      <button type="button" onClick={handleResetSP} title={t('Reset to default')}>
                        <IconRotate size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopy(record.saml_sp_entity_id)}
                        title={t('Copy to clipboard')}
                      >
                        <IconCopy size={16} />
                      </button>
                    </div>
                  }
                />

                <TextInput
                  label={t('SP Assertion Consumer Service (ACS) URL')}
                  value={record.saml_sp_acs_url || ''}
                  onChange={(e) =>
                    setRecord({
                      ...record,
                      saml_sp_acs_url: e.target.value,
                    })
                  }
                  rightSection={
                    <div className="flex items-center gap-2 mr-6">
                      <button
                        type="button"
                        onClick={() => handleCopy(record.saml_sp_acs_url)}
                        title={t('Copy to clipboard')}
                      >
                        <IconCopy size={16} />
                      </button>
                    </div>
                  }
                />

                <TextInput
                  label={t('SP Single Logout Service (SLS) URL')}
                  value={record.saml_sp_sls_url || ''}
                  onChange={(e) =>
                    setRecord({
                      ...record,
                      saml_sp_sls_url: e.target.value,
                    })
                  }
                  rightSection={
                    <div className="flex items-center gap-2 mr-6">
                      <button
                        type="button"
                        onClick={() => handleCopy(record.saml_sp_sls_url)}
                        title={t('Copy to clipboard')}
                      >
                        <IconCopy size={16} />
                      </button>
                    </div>
                  }
                />

                <H2>{t('Attribute Mapping')}</H2>
                <p className="text-sm text-gray-600 mb-4">
                  {t(
                    'Configure how SAML attributes from your Identity Provider map to user fields in the application. These attribute names must match exactly what your IdP sends in the SAML response.',
                  )}
                </p>

                <TextInput
                  label={t('Email Attribute Name')}
                  placeholder="http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"
                  value={record.saml_attribute_mapping?.email || ''}
                  onChange={(e) => handleAttributeMappingChange('email', e.target.value)}
                  description={t(
                    "The SAML attribute name that contains the user's email address. Used to match existing users.",
                  )}
                />

                <TextInput
                  label={t('Name Attribute Name')}
                  placeholder="http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"
                  value={record.saml_attribute_mapping?.name || ''}
                  onChange={(e) => handleAttributeMappingChange('name', e.target.value)}
                  description={t("The SAML attribute name that contains the user's display name.")}
                />

                <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-md">
                  <h4 className="text-sm font-medium text-gray-800 mb-2">
                    {t('Common Attribute Names by IdP:')}
                  </h4>
                  <div className="text-xs text-gray-700 space-y-1">
                    <div>
                      <strong>Keycloak:</strong> email, firstName, lastName, fullName
                    </div>
                    <div>
                      <strong>Azure AD:</strong>{' '}
                      http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress
                    </div>
                    <div>
                      <strong>Okta:</strong>{' '}
                      http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress
                    </div>
                  </div>
                </div>
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
