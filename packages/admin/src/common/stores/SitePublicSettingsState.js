import { create } from 'zustand';

const initialState = {
  settings: null,
};

const SitePublicSettingsState = create((set, get) => ({
  ...initialState,
  setSettings: (settings) => set({ settings }),
}));

export default SitePublicSettingsState;
