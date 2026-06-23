import { create } from 'zustand';

const GoToSiteLinkState = create((set) => ({
  goToSiteLink: '/',
  setGoToSiteLink: (link) => set({ goToSiteLink: link }),
}));

export default GoToSiteLinkState;
