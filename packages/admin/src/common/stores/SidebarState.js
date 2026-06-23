import { create } from 'zustand';

const SidebarState = create((set, get) => ({
  // State
  userPreferenceCollapsed: false, // The actual user preference
  temporaryOverride: null, // null = no override, true/false = temporary state
  isCollapsed: false, // Computed from userPreferenceCollapsed + temporaryOverride
  toggleFunction: null,

  // Internal helper to update computed state
  _updateIsCollapsed: () => {
    const { userPreferenceCollapsed, temporaryOverride } = get();
    const newIsCollapsed = temporaryOverride !== null ? temporaryOverride : userPreferenceCollapsed;
    set({ isCollapsed: newIsCollapsed });
  },

  // Actions
  setUserPreferenceCollapsed: (collapsed) => {
    set({ userPreferenceCollapsed: collapsed });
    get()._updateIsCollapsed();
  },

  setToggleFunction: (toggleFn) => set({ toggleFunction: toggleFn }),

  toggle: () => {
    const { toggleFunction } = get();
    if (toggleFunction) {
      toggleFunction();
    }
  },

  collapse: () => {
    const { toggleFunction } = get();
    const isCurrentlyCollapsed = get().isCollapsed;
    if (toggleFunction && !isCurrentlyCollapsed) {
      toggleFunction();
    }
  },

  expand: () => {
    const { toggleFunction } = get();
    const isCurrentlyCollapsed = get().isCollapsed;
    if (toggleFunction && isCurrentlyCollapsed) {
      toggleFunction();
    }
  },

  // Temporary collapse/expand without persisting to user preferences
  temporaryCollapse: () => {
    const isCurrentlyCollapsed = get().isCollapsed;
    if (!isCurrentlyCollapsed) {
      set({ temporaryOverride: true });
      get()._updateIsCollapsed();
    }
  },

  temporaryExpand: () => {
    const isCurrentlyCollapsed = get().isCollapsed;
    if (isCurrentlyCollapsed) {
      set({ temporaryOverride: false });
      get()._updateIsCollapsed();
    }
  },

  // Toggle temporary override state
  temporaryToggle: () => {
    const isCurrentlyCollapsed = get().isCollapsed;
    set({ temporaryOverride: !isCurrentlyCollapsed });
    get()._updateIsCollapsed();
  },

  // Clear temporary override and restore to user preference
  clearTemporaryOverride: () => {
    set({ temporaryOverride: null });
    get()._updateIsCollapsed();
  },
}));

// Initialize computed state
SidebarState.getState()._updateIsCollapsed();

export default SidebarState;
