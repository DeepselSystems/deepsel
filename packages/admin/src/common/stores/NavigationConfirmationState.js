import { create } from 'zustand';

const NavigationConfirmationState = create((set, get) => ({
  confirmationCallback: null,

  setNavigationConfirmation: (callback) => set({ confirmationCallback: callback }),

  clearNavigationConfirmation: () => set({ confirmationCallback: null }),

  confirmNavigation: (navigationCallback) => {
    const { confirmationCallback } = get();
    if (confirmationCallback) {
      confirmationCallback(navigationCallback);
    } else {
      navigationCallback();
    }
  },
}));

export default NavigationConfirmationState;
