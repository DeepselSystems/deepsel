import AppLayout from '../../common/layouts/AppLayout.jsx';
import {
  IconAdjustments,
  IconClock,
  IconSettings,
  IconUser,
  IconUsersGroup,
} from '@tabler/icons-react';

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
    label: 'Settings',
    // to: "/organization-settings",
    icon: IconSettings,
    roleIds: ['super_admin_role', 'admin_role'],
    children: [
      {
        label: 'General',
        to: '/organization-settings',
        icon: IconAdjustments,
        roleIds: ['super_admin_role', 'admin_role'],
      },
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
