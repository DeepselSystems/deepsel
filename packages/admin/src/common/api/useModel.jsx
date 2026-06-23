import { useModel as useModelBase } from '../lib/hooks';
import { useTranslation } from 'react-i18next';
import BackendHostURLState from '../stores/BackendHostURLState.js';
import OrganizationIdState from '../stores/OrganizationIdState.js';
import useAuthentication from './useAuthentication.js';

export default function useModel(modelName, options = {}) {
  const { t } = useTranslation();
  const { backendHost } = BackendHostURLState();
  const { user, setUser } = useAuthentication();
  const { organizationId } = OrganizationIdState();

  return useModelBase(modelName, { backendHost, user, setUser, organizationId, t }, options);
}
