import { useMemo } from 'react';
import { NavLink } from '@mantine/core';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function NavigationLink(props) {
  const { link, index, user, opened, toggle, children } = props;
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const userRoleIds = user?.all_roles?.map((rec) => rec.string_id) || [];

  const isVisible = useMemo(() => {
    const visible = link.roleIds
      ? link.roleIds.some((roleId) => userRoleIds.includes(roleId))
      : true;

    return visible;
  }, [link.roleIds, userRoleIds]);

  const isActive = useMemo(() => location.pathname.includes(link.to), [location.pathname, link.to]);

  if (!isVisible) {
    return null;
  }

  const IconComponent = link.icon;
  const leftSection = IconComponent && <IconComponent size={16} />;

  const commonProps = {
    label: t(link.label),
    leftSection,
    variant: 'filled',
    color: 'black',
    autoContrast: true,
    className: `hover:bg-text hover:text-primary-main transition-colors duration-200 rounded-md mb-1 text-white!`,
  };

  if (link.children?.length > 0) {
    return (
      <NavLink key={index} {...commonProps} active={isActive}>
        {children}
      </NavLink>
    );
  }

  return (
    <NavLink
      key={index}
      {...commonProps}
      active={isActive}
      onClick={() => {
        navigate(link.to);
        if (opened) toggle();
      }}
    />
  );
}
