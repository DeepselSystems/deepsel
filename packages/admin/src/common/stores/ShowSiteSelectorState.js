import { create } from 'zustand';

const ShowSiteSelectorState = create((set) => ({
  showSiteSelector: false,
  setShowSiteSelector: (show) => set({ showSiteSelector: show }),
}));

export default ShowSiteSelectorState;
