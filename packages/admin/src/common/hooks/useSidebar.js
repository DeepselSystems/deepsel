import SidebarState from '../stores/SidebarState.js';

/**
 * Hook to control the sidebar from any component
 * @returns {Object} Sidebar control functions and state
 */
export default function useSidebar() {
  const {
    isCollapsed,
    toggle,
    collapse,
    expand,
    temporaryCollapse,
    temporaryExpand,
    temporaryToggle,
    clearTemporaryOverride,
  } = SidebarState();

  return {
    isCollapsed,
    toggle,
    collapse,
    expand,
    temporaryCollapse,
    temporaryExpand,
    temporaryToggle,
    clearTemporaryOverride,
  };
}
