import { useCallback, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Alert, Avatar, ActionIcon, Tooltip } from '@mantine/core';
import { IconAlertTriangle, IconPlus, IconTrash } from '@tabler/icons-react';
import useModel from '../../../common/api/useModel.jsx';
import useAuthentication from '../../../common/api/useAuthentication.js';
import H1 from '../../../common/ui/H1.jsx';
import Button from '../../../common/ui/Button.jsx';
import Select from '../../../common/ui/Select.jsx';
import ListViewSearchBar from '../../../common/ui/ListViewSearchBar.jsx';
import ListViewPagination from '../../../common/ui/ListViewPagination.jsx';
import { ListViewSkeleton } from '../../../common/lib/ui';
import OrganizationIdState from '../../../common/stores/OrganizationIdState.js';
import NotificationState from '../../../common/stores/NotificationState.js';
import CreateUserModal from './CreateUserModal.jsx';
import useShowSiteSelector from '../../../common/hooks/useShowSiteSelector.js';
import { getAttachmentByNameRelativeUrl } from '@deepsel/cms-utils';

const CMS_ROLE_IDS = ['website_admin_role', 'website_editor_role', 'website_author_role'];

export default function ManageUsersList() {
  useShowSiteSelector();
  const { t } = useTranslation();
  const { organizationId } = OrganizationIdState();
  const { notify } = NotificationState();
  const { user: currentUser } = useAuthentication();
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const filterByOrganization = useCallback(
    (user) => {
      if (!organizationId) return true;
      return (
        user.organizations?.some((org) => org.id === organizationId) ||
        user.organizations?.length === 0
      );
    },
    [organizationId],
  );

  const usersQuery = useModel('user', {
    autoFetch: true,
    searchFields: ['name'],
    syncPagingParamsWithURL: true,
    filterAfterLoad: organizationId ? filterByOrganization : null,
  });
  const {
    data: users,
    setData: setUsers,
    loading,
    error,
    update,
    deleteWithConfirm,
    get: refetchUsers,
  } = usersQuery;

  const rolesQuery = useModel('role', {
    autoFetch: true,
    pageSize: null,
    filters: [{ field: 'string_id', operator: 'in', value: CMS_ROLE_IDS }],
  });
  const { data: roles } = rolesQuery;

  const roleOptions = useMemo(
    () =>
      CMS_ROLE_IDS.map((sid) => roles.find((r) => r.string_id === sid))
        .filter(Boolean)
        .map((r) => ({ value: String(r.id), label: r.name })),
    [roles],
  );

  const getCurrentCmsRoleId = (user) => {
    const role = user.roles?.find((r) => CMS_ROLE_IDS.includes(r.string_id));
    return role ? String(role.id) : null;
  };

  function handleDelete(user) {
    deleteWithConfirm(
      [user.id],
      () => {
        notify({ type: 'success', message: t('User deleted') });
        refetchUsers();
      },
      (e) => {
        notify({ type: 'error', message: e?.message || t('An error occurred') });
      },
    );
  }

  async function handleRoleChange(user, newRoleIdStr) {
    const newRole = newRoleIdStr ? roles.find((r) => String(r.id) === newRoleIdStr) : null;
    const nonCmsRoles = (user.roles || []).filter((r) => !CMS_ROLE_IDS.includes(r.string_id));
    const updatedRoles = newRole ? [...nonCmsRoles, newRole] : nonCmsRoles;
    const updatedUser = { ...user, roles: updatedRoles };
    setUsers(users.map((u) => (u.id === user.id ? updatedUser : u)));
    try {
      await update(updatedUser);
      notify({ type: 'success', message: t('Role updated') });
    } catch (e) {
      notify({ type: 'error', message: e.message || t('An error occurred') });
    }
  }

  return (
    <>
      <Helmet>
        <title>Users</title>
      </Helmet>
      <main className="h-[calc(100vh-50px-32px-20px)] flex flex-col m-auto px-[12px] sm:px-[24px]">
        <div className="flex w-full justify-between gap-2 my-3">
          <H1 className="text-[32px] font-bold">{t('Users')}</H1>
          <Button onClick={() => setCreateModalOpen(true)}>
            <IconPlus size={16} className="sm:mr-1" />
            <span className="hidden sm:inline">{t('Add User')}</span>
          </Button>
        </div>

        <ListViewSearchBar query={usersQuery} />

        {error && (
          <Alert
            color="red"
            variant="light"
            title="Error"
            className="mb-4"
            icon={<IconAlertTriangle size={16} />}
          >
            {error}
          </Alert>
        )}

        {loading && !users.length ? (
          <ListViewSkeleton />
        ) : (
          <div className="flex-1 overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-gray-500 border-b sticky top-0 bg-white">
                <tr>
                  <th className="py-3 px-2 font-medium">{t('User')}</th>
                  <th className="py-3 px-2 font-medium w-64">{t('Role')}</th>
                  <th className="py-3 px-2 font-medium w-12" />
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-2">
                      <Link
                        to={`/manage-users/${user.id}/edit`}
                        className="flex items-center gap-3 text-inherit"
                      >
                        <Avatar
                          name={user.name || user.email || user.username || ''}
                          color="initials"
                          src={
                            user?.image?.name
                              ? getAttachmentByNameRelativeUrl(user.image.name)
                              : null
                          }
                          size="md"
                        />
                        <div className="flex flex-col">
                          <span className="font-semibold">
                            {user.name || user.email || user.username}
                          </span>
                          {user.name && user.username && user.username !== user.name && (
                            <span className="text-xs text-gray-500">@{user.username}</span>
                          )}
                        </div>
                      </Link>
                    </td>
                    <td className="py-2 px-2">
                      <Select
                        data={roleOptions}
                        value={getCurrentCmsRoleId(user)}
                        onChange={(value) => handleRoleChange(user, value)}
                        placeholder={t('Select role')}
                        clearable
                        size="sm"
                      />
                    </td>
                    <td className="py-2 px-2 text-right">
                      <Tooltip
                        label={
                          currentUser?.id === user.id
                            ? t('You cannot delete yourself')
                            : t('Delete user')
                        }
                        withArrow
                      >
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          disabled={currentUser?.id === user.id}
                          onClick={() => handleDelete(user)}
                          aria-label={t('Delete user')}
                        >
                          <IconTrash size={18} />
                        </ActionIcon>
                      </Tooltip>
                    </td>
                  </tr>
                ))}
                {!users.length && !loading && (
                  <tr>
                    <td colSpan={3} className="text-center py-8 text-gray-500">
                      {t('Nothing here yet.')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <ListViewPagination query={usersQuery} />
      </main>

      <CreateUserModal
        opened={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreated={() => refetchUsers()}
        existingUsers={users}
      />
    </>
  );
}
