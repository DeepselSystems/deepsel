import { EnhancedImageSelector as BaseEnhancedImageSelector } from '../lib/ui/EnhancedImageSelector';
import BackendHostURLState from '../../stores/BackendHostURLState.js';
import UserState from '../../stores/UserState.js';
import NotificationState from '../../stores/NotificationState.js';
import OrganizationIdState from '../../stores/OrganizationIdState.js';

export function EnhancedImageSelector(props) {
  const { backendHost } = BackendHostURLState();
  const { user, setUser } = UserState();
  const { notify } = NotificationState();
  const { organizationId } = OrganizationIdState();
  return (
    <BaseEnhancedImageSelector
      backendHost={backendHost}
      user={user}
      setUser={setUser}
      notify={notify}
      organizationId={organizationId}
      {...props}
    />
  );
}

export function EnhancedImageSelectorModal(props) {
  return <EnhancedImageSelector {...props} />;
}
