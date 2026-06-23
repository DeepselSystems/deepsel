import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { IconBrandGoogle, IconCopy, IconRotate, IconUsersGroup } from '@tabler/icons-react';
import useModel from '../../../../common/api/useModel.jsx';
import BackendHostURLState from '../../../../common/stores/BackendHostURLState.js';
import NotificationState from '../../../../common/stores/NotificationState.js';
import Card from '../../../../common/ui/Card.jsx';
import EditFormActionBar from '../../../../common/ui/EditFormActionBar.jsx';
import FormViewSkeleton from '../../../../common/ui/FormViewSkeleton.jsx';
import H1 from '../../../../common/ui/H1.jsx';
import H2 from '../../../../common/ui/H2.jsx';
import PasswordInput from '../../../../common/ui/PasswordInput.jsx';
import Switch from '../../../../common/ui/Switch.jsx';
import TextArea from '../../../../common/ui/TextArea.jsx';
import TextInput from '../../../../common/ui/TextInput.jsx';
import useShowSiteSelector from '../../../../common/hooks/useShowSiteSelector.js';

export default function SiteSettingsAuthentication() {
  useShowSiteSelector();
  const { t } = useTranslation();
  const { backendHost } = BackendHostURLState((state) => state);
  const { record, setRecord, update, loading } = useModel('organization', {
    id: 1,
    autoFetch: true,
  });
  const { notify } = NotificationState();

  useEffect(() => {
    if (record?.is_enabled_google_sign_in && !record.google_redirect_uri) {
      setRecord({
        ...record,
        google_redirect_uri: `${backendHost}/auth/google`,
      });
    }
  }, [backendHost, record, setRecord]);

  useEffect(() => {
    if (record?.is_enabled_saml && !record.saml_sp_entity_id) {
      setRecord({
        ...record,
        saml_sp_entity_id: `${backendHost}/saml/metadata`,
        saml_sp_acs_url: `${backendHost}/auth/saml`,
        saml_sp_sls_url: `${backendHost}/sls/saml`,
      });
    }
  }, [backendHost, record, setRecord]);

  async function handleSubmit(e) {
    try {
      e.preventDefault();

      const payload = { ...record };

      if (!payload.is_enabled_google_sign_in) {
        payload.google_client_id = '';
        payload.google_client_secret = '';
        payload.google_redirect_uri = '';
      }

      if (!payload.is_enabled_saml) {
        payload.saml_idp_entity_id = '';
        payload.saml_idp_sso_url = '';
        payload.saml_idp_x509_cert = '';
        payload.saml_sp_entity_id = '';
        payload.saml_sp_acs_url = '';
        payload.saml_sp_sls_url = '';
      }

      const updatedRecord = await update(payload);
      setRecord(updatedRecord);
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
    }
  }

  async function handleCopy(text) {
    await navigator.clipboard.writeText(text);
    notify({
      message: t('Copied to clipboard!'),
      type: 'success',
    });
  }

  function handleResetGoogleRedirect() {
    setRecord({
      ...record,
      google_redirect_uri: `${backendHost}/auth/google`,
    });
  }

  function handleResetSamlSP() {
    setRecord({
      ...record,
      saml_sp_entity_id: `${backendHost}/saml/metadata`,
      saml_sp_acs_url: `${backendHost}/auth/saml`,
      saml_sp_sls_url: `${backendHost}/sls/saml`,
    });
  }

  function handleSamlAttributeMappingChange(field, value) {
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
          <H1>{t('Authentication')}</H1>

          <div className="mt-6 flex flex-col gap-10 max-w-[600px]">
            {/* Google Sign-In */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <IconBrandGoogle size={16} className="text-gray-600" />
                <H2>{t('Google Sign-In')}</H2>
              </div>

              <Switch
                className="my-2"
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
                <div className="flex flex-col gap-2">
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
                        <button
                          type="button"
                          onClick={handleResetGoogleRedirect}
                          title={t('Reset to default')}
                        >
                          <IconRotate size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopy(record.google_redirect_uri)}
                          title={t('Copy to clipboard')}
                        >
                          <IconCopy size={16} />
                        </button>
                      </div>
                    }
                  />
                </div>
              )}
            </div>

            {/* SAML SSO */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <IconUsersGroup size={16} className="text-gray-600" />
                <H2>{t('SAML SSO')}</H2>
              </div>

              <Switch
                className="my-2"
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
                <div className="flex flex-col gap-2">
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
                        <button
                          type="button"
                          onClick={handleResetSamlSP}
                          title={t('Reset to default')}
                        >
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
                    onChange={(e) => handleSamlAttributeMappingChange('email', e.target.value)}
                    description={t(
                      "The SAML attribute name that contains the user's email address. Used to match existing users.",
                    )}
                  />

                  <TextInput
                    label={t('Name Attribute Name')}
                    placeholder="http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"
                    value={record.saml_attribute_mapping?.name || ''}
                    onChange={(e) => handleSamlAttributeMappingChange('name', e.target.value)}
                    description={t(
                      "The SAML attribute name that contains the user's display name.",
                    )}
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
                </div>
              )}
            </div>
          </div>
        </Card>
      ) : (
        <FormViewSkeleton />
      )}
    </form>
  );
}
