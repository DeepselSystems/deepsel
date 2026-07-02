import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import useModel from '../../../common/api/useModel.jsx';
import BackendHostURLState from '../../../common/stores/BackendHostURLState.js';
import OrganizationIdState from '../../../common/stores/OrganizationIdState.js';
import NotificationState from '../../../common/stores/NotificationState.js';
import Card from '../../../common/ui/Card.jsx';
import CreateFormActionBar from '../../../common/ui/CreateFormActionBar.jsx';
import EditFormActionBar from '../../../common/ui/EditFormActionBar.jsx';
import FormViewSkeleton from '../../../common/ui/FormViewSkeleton.jsx';
import H1 from '../../../common/ui/H1.jsx';
import H2 from '../../../common/ui/H2.jsx';
import Select from '../../../common/ui/Select.jsx';
import Switch from '../../../common/ui/Switch.jsx';
import TextInput from '../../../common/ui/TextInput.jsx';
import PasswordInput from '../../../common/ui/PasswordInput.jsx';
import { IconCopy } from '@tabler/icons-react';

const ADAPTERS = [
  { value: 'oidc', label: 'Generic OIDC' },
  { value: 'entra', label: 'Microsoft Entra ID' },
  { value: 'auth0', label: 'Auth0' },
  { value: 'cognito', label: 'AWS Cognito' },
];

const EMPTY_PROVIDER = {
  issuer_url: '',
  display_name: '',
  adapter_name: 'oidc',
  client_id: '',
  client_secret: '',
  redirect_uri: '',
  scopes: 'openid email profile',
  enabled: false,
};

/**
 * Create / edit form for an `oidc_provider` row.
 *
 * `client_secret` is write-only: the backend never serializes it on reads, so the
 * field always renders blank and is only sent when the admin types a new value.
 * To configure Google, use issuer `https://accounts.google.com`.
 */
export default function OIDCProviderEdit() {
  const { t } = useTranslation();
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { backendHost } = BackendHostURLState((state) => state);
  const { organizationId } = OrganizationIdState();
  const { notify } = NotificationState();

  const query = useModel('oidc_provider', { id, autoFetch: isEdit });
  const { record, setRecord, create, update, loading } = query;

  // Seed an empty record for the create form (edit autoFetches its record).
  const [createRecord, setCreateRecord] = useState({ ...EMPTY_PROVIDER });
  const form = isEdit ? record : createRecord;
  const setForm = isEdit ? setRecord : setCreateRecord;

  // On edit, client_secret is never returned — keep the input blank and only
  // submit it when the admin types something.
  useEffect(() => {
    if (isEdit && record && record.client_secret === undefined) {
      setRecord({ ...record, client_secret: '' });
    }
  }, [isEdit, record, setRecord]);

  // The callback is always same-origin; the admin registers this exact URL in
  // their IdP, and it is persisted as the provider's redirect_uri.
  const callbackHint =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/v1/auth/oidc/callback`
      : `${backendHost}/auth/oidc/callback`;

  async function handleCopy(text) {
    await navigator.clipboard.writeText(text);
    notify({ message: t('Copied to clipboard!'), type: 'success' });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      if (isEdit) {
        const payload = { ...form, redirect_uri: callbackHint };
        // Write-only secret: omit when left blank so we don't wipe the stored one.
        if (!payload.client_secret) delete payload.client_secret;
        const updated = await update(payload);
        setRecord(updated);
        notify({ message: t('Provider updated successfully!'), type: 'success' });
      } else {
        const payload = {
          ...form,
          organization_id: organizationId,
          redirect_uri: callbackHint,
        };
        if (!payload.client_secret) delete payload.client_secret;
        await create(payload);
        notify({ message: t('Provider created successfully!'), type: 'success' });
        navigate(-1);
      }
    } catch (error) {
      console.error(error);
      notify({ message: error.message, type: 'error' });
    }
  }

  const update_field = (field) => (e) =>
    setForm({ ...form, [field]: e.target ? e.target.value : e });

  if (isEdit && !record) {
    return (
      <main className={`max-w-screen-xl m-auto my-[20px] px-[24px]`}>
        <FormViewSkeleton />
      </main>
    );
  }

  return (
    <main className={`max-w-screen-xl m-auto my-[20px] px-[24px]`}>
      <form onSubmit={handleSubmit}>
        {isEdit ? (
          <EditFormActionBar loading={loading} />
        ) : (
          <CreateFormActionBar loading={loading} title={t('Create SSO Provider')} />
        )}

        <Card className={`shadow-none border-none`}>
          <H1>{t('SSO Provider')}</H1>

          <div className={`flex gap-2 my-2 flex-col max-w-[600px]`}>
            <TextInput
              label={t('Issuer URL')}
              description={t('e.g. https://accounts.google.com or your Keycloak realm URL')}
              placeholder="https://accounts.google.com"
              required
              value={form.issuer_url || ''}
              onChange={update_field('issuer_url')}
            />

            <TextInput
              label={t('Display name')}
              placeholder={t('Google')}
              value={form.display_name || ''}
              onChange={update_field('display_name')}
            />

            <Select
              label={t('Adapter')}
              data={ADAPTERS}
              value={form.adapter_name || 'oidc'}
              onChange={(value) => setForm({ ...form, adapter_name: value })}
              allowDeselect={false}
            />

            <TextInput
              label={t('Client ID')}
              value={form.client_id || ''}
              onChange={update_field('client_id')}
            />

            <PasswordInput
              label={t('Client Secret')}
              description={
                isEdit
                  ? t('Leave blank to keep the current secret.')
                  : t('Stored encrypted; never shown again after saving.')
              }
              placeholder={isEdit ? '••••••••' : ''}
              value={form.client_secret || ''}
              onChange={update_field('client_secret')}
            />

            <H2 className="mt-4">{t('Endpoints')}</H2>

            <TextInput
              label={t('Redirect URI')}
              description={t('Register this exact URL in your IdP as the allowed callback.')}
              value={callbackHint}
              readOnly
              rightSection={
                <button
                  type="button"
                  className="mr-6"
                  onClick={() => handleCopy(callbackHint)}
                  title={t('Copy to clipboard')}
                >
                  <IconCopy size={16} />
                </button>
              }
            />

            <TextInput
              label={t('Scopes')}
              description={t('Space-separated OIDC scopes.')}
              placeholder="openid email profile"
              value={form.scopes || ''}
              onChange={update_field('scopes')}
            />

            <Switch
              className="my-2"
              label={t('Enabled')}
              checked={Boolean(form.enabled)}
              onChange={(e) => setForm({ ...form, enabled: e.currentTarget.checked })}
            />
          </div>
        </Card>
      </form>
    </main>
  );
}
