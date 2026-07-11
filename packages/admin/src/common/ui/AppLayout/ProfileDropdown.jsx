import { Menu, Avatar } from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getAttachmentByNameRelativeUrl } from '../../utils/index.js';
import useAuthentication from '../../api/useAuthentication.js';
import { IconArrowLeft, IconUser } from '@tabler/icons-react';

const ProfileDropdown = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, logout } = useAuthentication();

  if (!user) return null;

  return (
    <Menu shadow="md" width={200}>
      <Menu.Target>
        <div className="flex gap-2 items-center cursor-pointer font-[500] text-[13px]">
          <Avatar
            name={user.name || user.email || user.username || ''}
            color="initials"
            src={user?.image?.name ? getAttachmentByNameRelativeUrl(user.image.name) : null}
            size="md"
          />
          <div className="text-primary-main text-md font-semibold">
            {user.name || user.email || user.username || ''}
          </div>
        </div>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Label>{t('My account')}</Menu.Label>
        <Menu.Item
          onClick={() => navigate(`/manage-users/${user.id}/edit`)}
          leftSection={<IconUser size={16} />}
        >
          {t('Edit profile')}
        </Menu.Item>
        <Menu.Item onClick={logout} color="red" leftSection={<IconArrowLeft size={16} />}>
          {t('Logout')}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
};

export default ProfileDropdown;
