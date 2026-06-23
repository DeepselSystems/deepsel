import { IconPencilBolt } from '@tabler/icons-react';

export default [
  {
    label: 'CMS',
    icon: IconPencilBolt,
    className: 'text-blue-600 bg-white',
    to: '/pages',
    roleIds: [
      'admin_role',
      'super_admin_role',
      'website_admin_role',
      'website_author_role',
      'website_editor_role',
    ],
  },
];
