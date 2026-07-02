import AppLayout from '../../common/layouts/AppLayout.jsx';
import {
  IconAdjustments,
  IconClock,
  IconKey,
  IconMail,
  IconServer2,
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
  {
    label: 'Single Sign-On',
    icon: IconKey,
    roleIds: ['oidc_admin_role', 'admin_role'],
    children: [
      {
        label: 'Providers',
        to: '/oidc-providers',
        icon: IconServer2,
        roleIds: ['oidc_admin_role', 'admin_role'],
      },
      {
        label: 'Invites',
        to: '/oidc-invites',
        icon: IconMail,
        roleIds: ['oidc_admin_role', 'admin_role'],
      },
    ],
  },
];
export default function OrganizationLayout() {
  return <AppLayout navbarLinks={navbarLinks} showSiteSelector={false} />;
}
