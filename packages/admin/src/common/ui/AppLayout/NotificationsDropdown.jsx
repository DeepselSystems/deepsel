import { Menu } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import NotificationList from '../../notification/NotificationList.jsx';
import { IconBell } from '@tabler/icons-react';

const NotificationsDropdown = () => {
  const { t } = useTranslation();

  return (
    <Menu shadow="md" width={300}>
      <Menu.Target>
        {/*<Indicator label="5" color="red" size={13}>*/}
        <div>
          <IconBell size={18} className="cursor-pointer" />
        </div>
        {/*</Indicator>*/}
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Label>{t('Notifications')}</Menu.Label>
        <NotificationList />
      </Menu.Dropdown>
    </Menu>
  );
};

export default NotificationsDropdown;
