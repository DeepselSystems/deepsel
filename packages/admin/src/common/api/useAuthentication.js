import { useEffect } from 'react';
import { useAuthentication as useAuthenticationBase } from '../lib/hooks';
import BackendHostURLState from '../stores/BackendHostURLState.js';
import UserState from '../stores/UserState.js';
import OrganizationIdState from '../stores/OrganizationIdState.js';
import { LocalstorageKey } from '../../constants/localstorage.js';

export default function useAuthentication() {
  const { backendHost } = BackendHostURLState();
  const { user, setUser } = UserState();
  const { organizationId, setOrganizationId } = OrganizationIdState();

  /**
   * Set organizationId in localStorage when it changes
   */
  useEffect(() => {
    if (organizationId != null) {
      localStorage.setItem(LocalstorageKey.OrganizationId, String(organizationId));
    } else {
      localStorage.removeItem(LocalstorageKey.OrganizationId);
    }
  }, [organizationId]);

  return useAuthenticationBase({
    backendHost,
    user,
    setUser,
    organizationId,
    setOrganizationId,
  });
}
