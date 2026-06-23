import { create } from 'zustand';
import { LocalstorageKey } from '../../constants/localstorage.js';

const initialState = {
  organizationId: parseInt(localStorage.getItem('organizationId')) || 1,
};

export default create((set) => ({
  ...initialState,
  setOrganizationId: (organizationId) => {
    localStorage.setItem(LocalstorageKey.OrganizationId, organizationId && String(organizationId));
    set(() => ({ organizationId }));
  },
}));
