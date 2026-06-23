import React from 'react';
import useModel from '../api/useModel.jsx';
import useEffectOnce from './useEffectOnce.js';
import OrganizationState from '../stores/OrganizationState.js';
import useAuthentication from '../api/useAuthentication.js';
import OrganizationIdState from '../stores/OrganizationIdState.js';
import head from 'lodash/head';
import orderBy from 'lodash/orderBy';

/**
 * Get user's organizations (sites)
 *
 * @param {Array<Organization>} organizations
 * @param {User} user
 * @returns {Array<Organization>}
 */
const getOrganizations = (organizations, user) => {
  const userOrganizationIds = user?.organizations?.map((o) => o.id) || [];
  const result = organizations.filter((org) => userOrganizationIds.includes(org.id));
  return orderBy(result, (o) => o.id);
};

/**
 * A custom hook to manage and retrieve organization data within the application.
 *
 * @returns {Object} The organization management utility.
 * @property {Array<Organization>} organizations - The complete list of organizations.
 * @property {Array<Organization>} sites - The list of organizations filtered based on the logged-in user's permissions.
 * @property {Function} refresh - A function to refresh and fetch the latest organization data.
 */
const useOrganization = () => {
  // Organizations state
  const organizations = OrganizationState((state) => state.organizations);
  const setOrganizations = OrganizationState((state) => state.setOrganizations);

  // Selected organization
  const { organizationId, setOrganizationId } = OrganizationIdState((state) => state);

  // Logged in user
  const { user } = useAuthentication();

  // Get organization model
  const { get: getOrganizationsData } = useModel('organization', {
    autoFetch: false,
    pageSize: null,
  });

  /**
   * The list of organizations filtered based on the logged-in user's permissions.
   *
   * @type {Array<Organization>}
   */
  const sites = React.useMemo(() => {
    return getOrganizations(organizations, user);
  }, [organizations, user]);

  /**
   * Fetch organizations
   */
  const fetchOrganizations = React.useCallback(() => {
    getOrganizationsData()
      .then((response) => {
        // Set organization list
        setOrganizations(response.data);

        // Refill selected organization
        const filteredOrganizations = getOrganizations(response.data, user);
        const prevSelectedOrganization = filteredOrganizations.find(
          (organization) => String(organization.id) === String(organizationId),
        );

        // Be careful if you want to change this condition - it may lead to infinity loop
        if (!prevSelectedOrganization) {
          setOrganizationId(head(filteredOrganizations)?.id || null);
        }
      })
      .catch(() => {
        setOrganizations([]);
      });
  }, [getOrganizationsData, organizationId, setOrganizationId, setOrganizations, user]);

  /**
   * Use effect once when initialize
   */
  useEffectOnce(() => {
    fetchOrganizations();
  });

  return {
    organizations,
    sites,
    refresh: fetchOrganizations,
  };
};

export default useOrganization;
