import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import useModel from '../../../common/api/useModel.jsx';
import BackendHostURLState from '../../../common/stores/BackendHostURLState.js';
import OrganizationIdState from '../../../common/stores/OrganizationIdState.js';
import NotificationState from '../../../common/stores/NotificationState.js';
import Button from '../../../common/ui/Button.jsx';
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
import FileInput from '../../../common/ui/FileInput.jsx';
import { IconCheck, IconCopy, IconTrash } from '@tabler/icons-react';
import { IDP_PRESETS } from './idpPresets.jsx';
import { ProviderIcon, PRESET_ICON_KEYS, ATTACHMENT_ICON_PREFIX } from './providerIcons.jsx';

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
  icon: 'key',
  enabled: false,
};

/**
 * Read-only value the admin copies into their IdP config — styled as a code
 * chip, not a form input, since it is not editable here.
 */
function CopyValue({ label, description, value, copyTitle, onCopy }) {
  return (
    <div>
      <div className={`text-sm font-medium text-gray-700`}>{label}</div>
      <div className={`text-xs text-gray-500 mb-1.5`}>{description}</div>
      <div className={`flex items-start gap-1`}>
        <code
          className={`rounded-md bg-gray-100 px-2.5 py-1.5 font-mono text-[13px] text-gray-800 break-all`}
        >
          {value}
        </code>
        <button
          type="button"
          onClick={() => onCopy(value)}
          title={copyTitle}
          className={`shrink-0 rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700`}
        >
          <IconCopy size={15} />
        </button>
      </div>
    </div>
  );
}

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
  const { record, setRecord, create, update, deleteWithConfirm, loading } = query;

  // Seed an empty record for the create form (edit autoFetches its record).
  // redirect_uri defaults to this origin's callback but stays a normal,
  // editable field persisted as typed.
  const [createRecord, setCreateRecord] = useState(() => ({
    ...EMPTY_PROVIDER,
    redirect_uri:
      typeof window !== 'undefined' ? `${window.location.origin}/api/v1/auth/oidc/callback` : '',
  }));
  const form = isEdit ? record : createRecord;
  const setForm = isEdit ? setRecord : setCreateRecord;

  const [presetKey, setPresetKey] = useState(null);
  const selectedPreset = IDP_PRESETS.find((p) => p.key === presetKey);

  function applyPreset(preset) {
    setPresetKey(preset.key);
    // Prefill template values only — keep whatever credentials were already typed.
    setForm({ ...form, ...preset.values });
  }

  // On edit, client_secret is never returned — keep the input blank and only
  // submit it when the admin types something.
  useEffect(() => {
    if (isEdit && record && record.client_secret === undefined) {
      setRecord({ ...record, client_secret: '' });
    }
  }, [isEdit, record, setRecord]);

  // Suggested same-origin callback, used only as a placeholder for the
  // redirect_uri field — the stored DB value is what's shown and saved.
  const callbackHint =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/v1/auth/oidc/callback`
      : `${backendHost}/auth/oidc/callback`;

  // The backend derives post-logout (and all post-login) redirects from the
  // origin of the saved redirect_uri, so preview it from the field value.
  let postLogoutHint;
  try {
    postLogoutHint = `${new URL(form?.redirect_uri).origin}/admin`;
  } catch {
    postLogoutHint =
      typeof window !== 'undefined' ? `${window.location.origin}/admin` : `${backendHost}/admin`;
  }

  async function handleCopy(text) {
    await navigator.clipboard.writeText(text);
    notify({ message: t('Copied to clipboard!'), type: 'success' });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      if (isEdit) {
        const payload = { ...form };
        // Write-only secret: omit when left blank so we don't wipe the stored one.
        if (!payload.client_secret) delete payload.client_secret;
        const updated = await update(payload);
        setRecord(updated);
        notify({ message: t('Provider updated successfully!'), type: 'success' });
      } else {
        const payload = {
          ...form,
          organization_id: organizationId,
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

  function handleDelete() {
    deleteWithConfirm(
      [id],
      () => {
        notify({ message: t('Provider deleted successfully!'), type: 'success' });
        navigate(-1);
      },
      (error) => {
        console.error(error);
        notify({ message: error?.message || t('An error occurred'), type: 'error' });
      },
    );
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
          <EditFormActionBar
            loading={loading}
            slot={{
              prependButton: (
                <Button
                  type="button"
                  className="shadow text-[14px] font-[600]"
                  variant="outline"
                  color="red"
                  onClick={handleDelete}
                >
                  <IconTrash size={16} className="mr-1" />
                  {t('Delete')}
                </Button>
              ),
            }}
          />
        ) : (
          <CreateFormActionBar loading={loading} title={t('Create SSO Provider')} />
        )}

        <Card className={`shadow-none border-none`}>
          <H1>{t('SSO Provider')}</H1>

          {!isEdit && (
            <div className={`my-4 max-w-[600px]`}>
              <div className={`text-sm font-medium text-gray-700`}>{t('Quick setup')}</div>
              <div className={`text-xs text-gray-500 mb-2`}>
                {t('Prefill settings for a popular identity provider.')}
              </div>
              <div className={`grid grid-cols-2 sm:grid-cols-3 gap-2`}>
                {IDP_PRESETS.map((preset) => {
                  const selected = presetKey === preset.key;
                  return (
                    <button
                      key={preset.key}
                      type="button"
                      onClick={() => applyPreset(preset)}
                      aria-pressed={selected}
                      className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm font-medium text-left transition-all duration-150 ${
                        selected
                          ? 'border-primary-500 bg-primary-50 text-primary-850 shadow-sm'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50 hover:shadow-sm'
                      }`}
                    >
                      <span className={`shrink-0 flex items-center`}>{preset.logo}</span>
                      <span className={`truncate grow`}>{preset.name}</span>
                      {selected && <IconCheck size={16} className={`shrink-0 text-primary-600`} />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className={`flex gap-2 my-2 flex-col max-w-[600px]`}>
            <TextInput
              label={t('Issuer URL')}
              description={
                selectedPreset
                  ? t(selectedPreset.issuerHint)
                  : t('Your identity provider issuer URL')
              }
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

            <div>
              <div className={`text-sm font-medium text-gray-700`}>{t('Icon')}</div>
              <div className={`text-xs text-gray-500 mb-2`}>
                {t('Shown on the login button. Pick a preset or upload a custom image.')}
              </div>
              <div className={`flex flex-wrap items-center gap-2`}>
                {PRESET_ICON_KEYS.map((iconKey) => {
                  const selected = (form.icon || 'key') === iconKey;
                  return (
                    <button
                      key={iconKey}
                      type="button"
                      onClick={() => setForm({ ...form, icon: iconKey })}
                      aria-pressed={selected}
                      title={iconKey}
                      className={`flex h-10 w-10 items-center justify-center rounded-lg border-2 transition-all duration-150 ${
                        selected
                          ? 'border-primary-500 bg-primary-50 shadow-sm ring-2 ring-primary-200'
                          : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 hover:shadow-sm'
                      }`}
                    >
                      <ProviderIcon icon={iconKey} size={22} />
                    </button>
                  );
                })}
                <div
                  className={`flex items-center justify-center rounded-lg border-2 ${
                    form.icon?.startsWith(ATTACHMENT_ICON_PREFIX)
                      ? 'border-primary-500 bg-primary-50 shadow-sm ring-2 ring-primary-200'
                      : 'border-gray-200 bg-white'
                  }`}
                  title={t('Upload custom icon')}
                >
                  <FileInput
                    type="image"
                    width={40}
                    height={40}
                    value={
                      form.icon?.startsWith(ATTACHMENT_ICON_PREFIX)
                        ? form.icon.slice(ATTACHMENT_ICON_PREFIX.length)
                        : undefined
                    }
                    onChange={(file) =>
                      setForm({
                        ...form,
                        icon: file ? `${ATTACHMENT_ICON_PREFIX}${file.name}` : 'key',
                      })
                    }
                  />
                </div>
              </div>
            </div>

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
              description={t(
                'Where the IdP sends users back after login. Register this exact URL in your IdP as the allowed callback.',
              )}
              placeholder={callbackHint}
              value={form.redirect_uri || ''}
              onChange={update_field('redirect_uri')}
              rightSection={
                <button
                  type="button"
                  className="mr-6"
                  onClick={() => handleCopy(form.redirect_uri || '')}
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
