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
    localStorage.setItem(LocalstorageKey.OrganizationId, organizationId && String(organizationId));
  }, [organizationId]);

  return useAuthenticationBase({
    backendHost,
    user,
    setUser,
    organizationId,
    setOrganizationId,
  });
}
