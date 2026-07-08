import { useTranslation } from 'react-i18next';
import { ActionIcon, Tooltip } from '@mantine/core';
import { IconTrash, IconRefresh } from '@tabler/icons-react';
import dayjs from 'dayjs';
import Chip from '../../../common/ui/Chip.jsx';

/**
 * Presentational list of open SSO invites (not yet accepted) for the current
 * org, rendered below the users table. Invites leave this list once the invitee
 * signs in (they become a real user row). The parent owns the `pending_invite`
 * query and passes `invites` + the revoke/re-invite handlers.
 */
export default function PendingInvitesSection({ invites = [], onRevoke, onReinvite }) {
  const { t } = useTranslation();
  if (!invites.length) return null;

  return (
    <div className="mt-6">
      <h2 className="text-lg font-semibold mb-2">{t('Pending links')}</h2>
      <table className="w-full text-sm">
        <thead className="text-left text-gray-500 border-b">
          <tr>
            <th className="py-2 px-2 font-medium">{t('Email')}</th>
            <th className="py-2 px-2 font-medium">{t('Roles')}</th>
            <th className="py-2 px-2 font-medium w-40">{t('Expires')}</th>
            <th className="py-2 px-2 font-medium w-32">{t('Status')}</th>
            <th className="py-2 px-2 font-medium w-20" />
          </tr>
        </thead>
        <tbody>
          {invites.map((invite) => {
            const expired = invite.expires_at && dayjs(invite.expires_at).isBefore(dayjs());
            return (
              <tr key={invite.id} className="border-b hover:bg-gray-50">
                <td className="py-2 px-2">{invite.email}</td>
                <td className="py-2 px-2">
                  <div className="flex gap-1 items-center flex-wrap">
                    {invite.roles?.map((r) => (
                      <Chip size="xs" key={r.id} variant="outline">
                        {r.name}
                      </Chip>
                    ))}
                  </div>
                </td>
                <td className="py-2 px-2">
                  {invite.expires_at ? dayjs(invite.expires_at).format('YYYY-MM-DD') : '—'}
                </td>
                <td className="py-2 px-2">
                  <Chip size="xs" variant="outline" color={expired ? 'gray' : 'yellow'}>
                    {expired ? t('Expired') : t('Pending')}
                  </Chip>
                </td>
                <td className="py-2 px-2 text-right whitespace-nowrap">
                  {expired && (
                    <Tooltip label={t('Renew')} withArrow>
                      <ActionIcon
                        variant="subtle"
                        color="blue"
                        onClick={() => onReinvite?.(invite)}
                        aria-label={t('Renew')}
                      >
                        <IconRefresh size={18} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                  <Tooltip label={t('Revoke link')} withArrow>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      onClick={() => onRevoke?.(invite)}
                      aria-label={t('Revoke link')}
                    >
                      <IconTrash size={18} />
                    </ActionIcon>
                  </Tooltip>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
