import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { NumberInput } from '@mantine/core';
import useModel from '../../../common/api/useModel.jsx';
import OrganizationIdState from '../../../common/stores/OrganizationIdState.js';
import NotificationState from '../../../common/stores/NotificationState.js';
import Card from '../../../common/ui/Card.jsx';
import CreateFormActionBar from '../../../common/ui/CreateFormActionBar.jsx';
import H1 from '../../../common/ui/H1.jsx';
import TextInput from '../../../common/ui/TextInput.jsx';
import RecordSelectMulti from '../../../common/ui/RecordSelectMulti.jsx';

/**
 * Create form for a `pending_invite`. Posts to the custom multi-role create
 * endpoint: `{ organization_id, email, roles: number[], expires_in_days }`.
 * Roles are bound to org membership when the invitee first signs in via SSO.
 */
export default function OIDCInviteCreate() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { organizationId } = OrganizationIdState();
  const { notify } = NotificationState((state) => state);

  const query = useModel('pending_invite');
  const { create, loading } = query;

  const [email, setEmail] = useState('');
  const [roles, setRoles] = useState([]);
  const [expiresInDays, setExpiresInDays] = useState(14);

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      await create({
        organization_id: organizationId,
        email,
        roles: roles.map((r) => r.id),
        expires_in_days: expiresInDays,
      });
      notify({ message: t('Invite created successfully!'), type: 'success' });
      navigate(-1);
    } catch (error) {
      console.error(error);
      notify({ message: error.message, type: 'error' });
    }
  }

  return (
    <main className={`max-w-screen-xl m-auto my-[20px] px-[24px]`}>
      <form onSubmit={handleSubmit}>
        <CreateFormActionBar loading={loading} title={t('Create Invite')} />

        <Card>
          <H1>{t('SSO Invite')}</H1>

          <div className={`flex gap-2 my-2 flex-col max-w-[600px]`}>
            <TextInput
              label={t('Email')}
              type="email"
              required
              placeholder="user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <RecordSelectMulti
              model="role"
              displayField="name"
              searchFields={['name']}
              label={t('Roles')}
              placeholder={t('Select roles')}
              value={roles}
              onChange={setRoles}
            />

            <NumberInput
              label={t('Expires in (days)')}
              min={1}
              max={365}
              value={expiresInDays}
              onChange={setExpiresInDays}
            />
          </div>
        </Card>
      </form>
    </main>
  );
}
