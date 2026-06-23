import { create } from 'zustand';

/**
 * @type {{organizations: Array<Organization>}}
 */
const initialState = {
  organizations: [],
};

const OrganizationState = create((set) => ({
  organizations: initialState.organizations,

  /**
   * Set organizations
   *
   * @param {Array<Organization>} organizations
   */
  setOrganizations: (organizations) => {
    set(() => ({ organizations }));
  },
}));

export default OrganizationState;
