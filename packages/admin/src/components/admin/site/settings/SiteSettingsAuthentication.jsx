import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { IconCopy, IconRotate, IconUsersGroup } from '@tabler/icons-react';
import BackendHostURLState from '../../../../common/stores/BackendHostURLState.js';
import NotificationState from '../../../../common/stores/NotificationState.js';
import H2 from '../../../../common/ui/H2.jsx';
import Switch from '../../../../common/ui/Switch.jsx';
import TextArea from '../../../../common/ui/TextArea.jsx';
import TextInput from '../../../../common/ui/TextInput.jsx';
import SiteSettingsSection from './SiteSettingsSection.jsx';

/**
 * Authentication settings form — SAML SSO configuration.
 * Data is always scoped to the currently selected organization via SiteSettingsSection.
 */
export default function SiteSettingsAuthentication() {
  const { t } = useTranslation();
  const { backendHost } = BackendHostURLState((state) => state);
  const { notify } = NotificationState();

  /**
   * Copies text to clipboard and shows a success notification
   */
  async function handleCopy(text) {
    await navigator.clipboard.writeText(text);
    notify({
      message: t('Copied to clipboard!'),
      type: 'success',
    });
  }

  return (
    <SiteSettingsSection
      onSubmit={async ({ record, update, setRecord }) => {
        const payload = { ...record };

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
      }}
    >
      {({ record, setRecord }) => (
        <AuthenticationFields
          record={record}
          setRecord={setRecord}
          backendHost={backendHost}
          onCopy={handleCopy}
          t={t}
        />
      )}
    </SiteSettingsSection>
  );
}

/**
 * Inner fields component — separated so hooks (useEffect) can run with record in scope.
 */
function AuthenticationFields({ record, setRecord, backendHost, onCopy, t }) {
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

  /**
   * Resets SAML SP fields (entity ID, ACS URL, SLS URL) to backend defaults
   */
  function handleResetSamlSP() {
    setRecord({
      ...record,
      saml_sp_entity_id: `${backendHost}/saml/metadata`,
      saml_sp_acs_url: `${backendHost}/auth/saml`,
      saml_sp_sls_url: `${backendHost}/sls/saml`,
    });
  }

  /**
   * Updates a single field in the SAML attribute mapping object
   */
  function handleSamlAttributeMappingChange(field, value) {
    const mapping = record.saml_attribute_mapping || {};
    mapping[field] = value;
    setRecord({
      ...record,
      saml_attribute_mapping: mapping,
    });
  }

  return (
    <div className="flex flex-col gap-10 max-w-[600px]">
      {/* SAML SSO */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <IconUsersGroup size={16} className="text-gray-600" />
          <H2>{t('SAML')}</H2>
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
                  <button type="button" onClick={handleResetSamlSP} title={t('Reset to default')}>
                    <IconRotate size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onCopy(record.saml_sp_entity_id)}
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
                    onClick={() => onCopy(record.saml_sp_acs_url)}
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
                    onClick={() => onCopy(record.saml_sp_sls_url)}
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
          </div>
        )}
      </div>
    </div>
  );
}
