import { useUpload as useUploadBase } from '../lib/hooks';
import BackendHostURLState from '../stores/BackendHostURLState.js';
import OrganizationIdState from '../stores/OrganizationIdState.js';
import useAuthentication from './useAuthentication.js';

export default function useUpload() {
  const { user } = useAuthentication();
  const { backendHost } = BackendHostURLState();
  const { organizationId } = OrganizationIdState();

  return useUploadBase({ backendHost, token: user?.token, organizationId });
}
