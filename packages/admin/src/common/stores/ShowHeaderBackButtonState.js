import { create } from 'zustand';

const ShowHeaderBackButtonState = create((set) => ({
  showBackButton: false,
  setShowBackButton: (show) => set({ showBackButton: show }),
}));

export default ShowHeaderBackButtonState;
