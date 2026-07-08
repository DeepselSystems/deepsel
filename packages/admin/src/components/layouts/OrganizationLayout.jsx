import AppLayout from '../../common/layouts/AppLayout.jsx';
import { IconClock, IconSettings, IconUser, IconUsersGroup } from '@tabler/icons-react';

const navbarLinks = [
  {
    label: 'Users',
    to: '/users',
    icon: IconUser,
    roleIds: ['super_admin_role', 'admin_role'],
  },
  {
    label: 'Roles',
    to: '/roles',
    icon: IconUsersGroup,
    roleIds: ['super_admin_role', 'admin_role'],
  },
  {
    label: 'Technical Settings',
    icon: IconSettings,
    roleIds: ['super_admin_role', 'admin_role'],
    children: [
      {
        label: 'Scheduled Actions',
        to: '/crons',
        icon: IconClock,
        roleIds: ['super_admin_role', 'admin_role'],
      },
    ],
  },
];
export default function OrganizationLayout() {
  return <AppLayout navbarLinks={navbarLinks} showSiteSelector={false} />;
}
