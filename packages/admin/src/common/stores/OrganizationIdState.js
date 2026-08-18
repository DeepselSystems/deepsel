import { create } from 'zustand';
import { LocalstorageKey } from '../../constants/localstorage.js';

const initialState = {
  organizationId: parseInt(localStorage.getItem('organizationId')) || null,
};

export default create((set) => ({
  ...initialState,
  setOrganizationId: (organizationId) => {
    if (organizationId != null) {
      localStorage.setItem(LocalstorageKey.OrganizationId, String(organizationId));
    } else {
      localStorage.removeItem(LocalstorageKey.OrganizationId);
    }
    set(() => ({ organizationId }));
  },
}));
