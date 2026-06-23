import useAuthentication from '../api/useAuthentication.js';

export default function VisibilityControl(props) {
  const {
    roleIds = [], // string_ids of roles
    render = true,
    children,
  } = props;

  const { user } = useAuthentication();
  const userRoleIds = user?.all_roles?.map((rec) => rec.string_id) || [];
  const isVisible = roleIds.some((roleId) => userRoleIds.includes(roleId));

  if (render) {
    return <div className={`${isVisible ? '' : 'invisible cursor-none'}`}>{children}</div>;
  } else {
    return isVisible ? children : null;
  }
}
