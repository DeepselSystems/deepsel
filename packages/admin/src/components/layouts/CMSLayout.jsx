import AppLayout from '../../common/layouts/AppLayout.jsx';
import {
  IconAdjustments,
  IconCode,
  IconDatabase,
  IconKey,
  IconLock,
  IconMail,
  IconMenu2,
  IconNews,
  IconPalette,
  IconPhoto,
  IconRobot,
  IconServer2,
  IconSettings,
  IconUser,
  IconWorld,
} from '@tabler/icons-react';

const navbarLinks = [
  {
    label: 'Pages',
    to: '/pages',
    icon: IconWorld,
  },
  {
    label: 'Blog Posts',
    to: '/blog_posts',
    icon: IconNews,
  },
  {
    label: 'Templates',
    to: '/templates',
    icon: IconCode,
  },
  {
    label: 'Themes',
    to: '/themes',
    icon: IconPalette,
    roleIds: ['website_admin_role'],
  },
  {
    label: 'Forms',
    icon: IconPalette,
    roleIds: ['website_admin_role'],
    children: [
      {
        label: 'Forms',
        to: '/forms',
        icon: IconAdjustments,
        roleIds: ['website_admin_role'],
      },
      {
        label: 'Submissions',
        to: '/form-submissions',
        icon: IconAdjustments,
        roleIds: ['website_admin_role'],
      },
    ],
  },
  {
    label: 'Media',
    to: '/media',
    icon: IconPhoto,
  },
  {
    label: 'Menus',
    to: '/menus',
    icon: IconMenu2,
  },
  {
    label: 'Users',
    to: '/manage-users',
    icon: IconUser,
    roleIds: ['website_admin_role'],
  },
  {
    label: 'Site Settings',
    icon: IconSettings,
    roleIds: ['website_admin_role'],
    children: [
      {
        label: 'General',
        to: '/site-settings/general',
        icon: IconAdjustments,
        roleIds: ['website_admin_role'],
      },
      {
        label: 'AI Settings',
        to: '/site-settings/ai',
        icon: IconRobot,
        roleIds: ['website_admin_role'],
      },
      {
        label: 'Email Settings',
        to: '/smtp-settings',
        icon: IconMail,
        roleIds: ['website_admin_role'],
      },
      {
        label: 'Authentication',
        icon: IconLock,
        roleIds: ['website_admin_role'],
        children: [
          {
            label: 'General',
            to: '/site-settings/auth-general',
            icon: IconAdjustments,
            roleIds: ['website_admin_role'],
          },
          {
            label: 'SSO Providers',
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
          {
            label: 'SAML',
            to: '/site-settings/authentication',
            icon: IconKey,
            roleIds: ['website_admin_role'],
          },
        ],
      },
      {
        label: 'Backup & Restore',
        to: '/site-settings/backup',
        icon: IconDatabase,
        roleIds: ['website_admin_role'],
      },
    ],
  },
];

export default function CMSLayout() {
  return <AppLayout navbarLinks={navbarLinks} showSiteSelector />;
}
