import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  Radio,
  ActionIcon,
  Tooltip,
  SegmentedControl,
  NumberInput,
  Alert,
} from '@mantine/core';
import {
  IconRefresh,
  IconCopy,
  IconCheck,
  IconEye,
  IconEyeOff,
  IconInfoCircle,
} from '@tabler/icons-react';
import useModel from '../../../common/api/useModel.jsx';
import Button from '../../../common/ui/Button.jsx';
import TextInput from '../../../common/ui/TextInput.jsx';
import PasswordInput from '../../../common/ui/PasswordInput.jsx';
import NotificationState from '../../../common/stores/NotificationState.js';
import OrganizationIdState from '../../../common/stores/OrganizationIdState.js';
import useOrgSSOProviders from './useOrgSSOProviders.js';

const CMS_ROLE_IDS = ['website_admin_role', 'website_editor_role', 'website_author_role'];

function generatePassword(length = 16) {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  const array = new Uint32Array(length);
  crypto.getRandomValues(array);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += charset[array[i] % charset.length];
  }
  return out;
}

export default function CreateUserModal({
  opened,
  onClose,
  onCreated,
  onInvited,
  existingUsers = [],
  pendingInvites = [],
}) {
  const { t } = useTranslation();
  const { notify } = NotificationState((state) => state);
  const { create: createUser, loading: userLoading } = useModel('user');
  const {
    create: createInvite,
    del: deleteInvite,
    loading: inviteLoading,
  } = useModel('pending_invite');
  const { organizationId } = OrganizationIdState();
  const { hasSSO } = useOrgSSOProviders();

  const [method, setMethod] = useState('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState('');
  const [expiresInDays, setExpiresInDays] = useState(14);
  const [copied, setCopied] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [errors, setErrors] = useState({});

  const loading = userLoading || inviteLoading;

  const { data: roles } = useModel('role', {
    autoFetch: true,
    pageSize: null,
    filters: [{ field: 'string_id', operator: 'in', value: CMS_ROLE_IDS }],
  });

  const orderedRoles = useMemo(
    () => CMS_ROLE_IDS.map((sid) => roles.find((r) => r.string_id === sid)).filter(Boolean),
    [roles],
  );

  useEffect(() => {
    if (!opened) {
      setEmail('');
      setPassword('');
      setRoleId('');
      setExpiresInDays(14);
      setCopied(false);
      setPasswordVisible(false);
      setErrors({});
    } else {
      // Default to the SSO-invite flow when the org has a provider configured.
      setMethod(hasSSO ? 'invite' : 'password');
    }
  }, [opened, hasSSO]);

  useEffect(() => {
    if (!roleId && orderedRoles.length) {
      setRoleId(String(orderedRoles[0].id));
    }
  }, [orderedRoles, roleId]);

  const normalizedEmail = email.trim().toLowerCase();
  const existingMember = useMemo(
    () =>
      normalizedEmail
        ? existingUsers.find((u) => (u.email || '').toLowerCase() === normalizedEmail)
        : null,
    [existingUsers, normalizedEmail],
  );
  const existingInvite = useMemo(
    () =>
      normalizedEmail
        ? pendingInvites.find((inv) => (inv.email || '').toLowerCase() === normalizedEmail)
        : null,
    [pendingInvites, normalizedEmail],
  );

  function handleAutogenerate() {
    const pw = generatePassword();
    setPassword(pw);
    setCopied(false);
  }

  async function handleCopy() {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // noop
    }
  }

  function validate() {
    const nextErrors = {};
    if (!email.trim()) nextErrors.email = t('Email is required');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      nextErrors.email = t('Invalid email address');
    if (!roleId) nextErrors.role = t('Role is required');
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function submitPassword() {
    const selectedRole = orderedRoles.find((r) => String(r.id) === roleId);
    const record = {
      email: email.trim(),
      roles: selectedRole ? [selectedRole] : [],
      organizations: organizationId ? [{ id: organizationId }] : [],
    };
    if (password) record.password = password;

    try {
      const created = await createUser(record);
      if (created) {
        notify({ type: 'success', message: t('User created successfully!') });
        onCreated?.(created);
        onClose();
      }
    } catch (err) {
      if (/already exists/i.test(err.message || '')) {
        setErrors({ email: t('A user with this email already exists') });
      } else {
        notify({ type: 'error', message: err.message || t('An error occurred') });
      }
    }
  }

  async function submitInvite() {
    try {
      // Replace an existing open invite for this email so roles/expiry refresh.
      if (existingInvite) {
        await deleteInvite(existingInvite.id);
      }
      await createInvite({
        organization_id: organizationId,
        email: email.trim(),
        roles: [Number(roleId)],
        expires_in_days: expiresInDays,
      });
      notify({
        type: 'success',
        message: t("Link created. They'll get access when they first sign in via SSO."),
      });
      onInvited?.();
      onClose();
    } catch (err) {
      notify({ type: 'error', message: err.message || t('An error occurred') });
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;
    if (method === 'invite') await submitInvite();
    else await submitPassword();
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={<span className="font-semibold">{t('Add User')}</span>}
      size="md"
      centered
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {hasSSO && (
          <SegmentedControl
            fullWidth
            value={method}
            onChange={setMethod}
            data={[
              { label: t('Link via SSO'), value: 'invite' },
              { label: t('Set a password'), value: 'password' },
            ]}
          />
        )}

        <TextInput
          label={t('Email')}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.currentTarget.value)}
          required
          error={errors.email}
          autoFocus
        />

        {method === 'invite' && existingMember && (
          <Alert color="yellow" variant="light" icon={<IconInfoCircle size={16} />}>
            {t(
              'This email already belongs to a member — the role will be applied the next time they sign in.',
            )}
          </Alert>
        )}
        {method === 'invite' && existingInvite && (
          <Alert color="yellow" variant="light" icon={<IconInfoCircle size={16} />}>
            {t('A link already exists for this email — this will replace it.')}
          </Alert>
        )}

        {method === 'password' && (
          <PasswordInput
            label={t('Password')}
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            visible={passwordVisible}
            onVisibilityChange={setPasswordVisible}
            rightSection={
              <div className="flex items-center gap-1 pr-1">
                <Tooltip label={passwordVisible ? t('Hide') : t('Show')}>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    onClick={() => setPasswordVisible((v) => !v)}
                    aria-label={passwordVisible ? t('Hide password') : t('Show password')}
                  >
                    {passwordVisible ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                  </ActionIcon>
                </Tooltip>
                {password && (
                  <Tooltip label={copied ? t('Copied') : t('Copy')}>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      onClick={handleCopy}
                      aria-label={t('Copy password')}
                    >
                      {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                    </ActionIcon>
                  </Tooltip>
                )}
                <Tooltip label={t('Autogenerate')}>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    onClick={handleAutogenerate}
                    aria-label={t('Autogenerate password')}
                  >
                    <IconRefresh size={16} />
                  </ActionIcon>
                </Tooltip>
              </div>
            }
            rightSectionWidth={password ? 96 : 68}
          />
        )}

        <Radio.Group
          label={t('Role')}
          value={roleId}
          onChange={setRoleId}
          error={errors.role}
          required
        >
          <div className="flex flex-col gap-2 mt-2">
            {orderedRoles.map((role) => (
              <label
                key={role.id}
                className="flex items-start gap-2 p-2 cursor-pointer hover:bg-gray-50"
              >
                <Radio value={String(role.id)} className="mt-1" />
                <div className="flex flex-col">
                  <span className="font-medium">{role.name}</span>
                  {role.description && (
                    <span className="text-xs text-gray-500">{role.description}</span>
                  )}
                </div>
              </label>
            ))}
          </div>
        </Radio.Group>

        {method === 'invite' && (
          <>
            <NumberInput
              label={t('Expires in (days)')}
              min={1}
              max={365}
              value={expiresInDays}
              onChange={setExpiresInDays}
            />
            <p className="text-xs text-gray-500">
              {t(
                "Access and the role are granted the first time they sign in via SSO. They won't be able to sign in until you provision their account in your SSO provider.",
              )}
            </p>
          </>
        )}

        <div className="flex justify-end gap-2 mt-2">
          <Button type="button" variant="subtle" onClick={onClose} disabled={loading}>
            {t('Cancel')}
          </Button>
          <Button type="submit" loading={loading}>
            {method === 'invite' ? t('Create link') : t('Create')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
