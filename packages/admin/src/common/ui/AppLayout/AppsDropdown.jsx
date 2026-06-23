import { Menu } from '@mantine/core';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { IconGridDots } from '@tabler/icons-react';
import H3 from '../H3.jsx';
import useAuthentication from '../../api/useAuthentication.js';

const AppsDropdown = ({ apps, showApps }) => {
  const { t } = useTranslation();
  const { user } = useAuthentication();

  if (!showApps) return null;

  return (
    <Menu shadow="md" width={220}>
      <Menu.Target>
        <button className="max-w-full cursor-pointer flex items-center justify-center">
          <IconGridDots size={20} />
        </button>
      </Menu.Target>

      <Menu.Dropdown>
        <div className="p-2">
          <H3>{t('Apps')}</H3>
          <div className="flex gap-3 flex-wrap justify-center">
            {apps.map((link, index) => {
              const userRoleIds = user?.all_roles?.map((rec) => rec.string_id) || [];
              const isVisible = link.roleIds
                ? link.roleIds.some((roleId) => userRoleIds.includes(roleId))
                : true;

              if (!isVisible) {
                return null;
              }

              return (
                <Link
                  key={index}
                  to={link.to}
                  className="w-[70px] flex flex-col items-center gap-2 mt-2 cursor-pointer"
                >
                  <div
                    className={`w-[60px] h-[60px] border border-gray-200 shadow text-lg transition-all !rounded-xl hover:-translate-y-0.5 p-0 flex justify-center items-center cursor-pointer ${link.className}`}
                  >
                    {link.icon && <link.icon size={20} />}
                  </div>
                  <div className="text-[13px] font-[500] text-wrap text-center">
                    {t(link.label)}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </Menu.Dropdown>
    </Menu>
  );
};

export default AppsDropdown;
