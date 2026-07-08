import { useEffect, useState } from 'react';
import BackendHostURLState from '../../../common/stores/BackendHostURLState.js';
import OrganizationIdState from '../../../common/stores/OrganizationIdState.js';

/**
 * Whether the current org has any enabled OIDC provider.
 *
 * Hits the public `GET /login/oidc/providers` endpoint (the same one the login
 * page uses) so it works even for admins who lack `oidc_provider` read
 * permission. Drives whether the "Add User" dialog offers the SSO-invite method.
 */
export default function useOrgSSOProviders() {
  const { backendHost } = BackendHostURLState();
  const { organizationId } = OrganizationIdState();
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!backendHost || !organizationId) {
      setProviders([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`${backendHost}/login/oidc/providers?organization_id=${organizationId}`, {
      credentials: 'include',
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!cancelled) setProviders(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setProviders([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [backendHost, organizationId]);

  return { providers, hasSSO: providers.length > 0, loading };
}
