import useSidebar from '../../hooks/useSidebar.js';
import Button from '../Button.jsx';
import {
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconChevronLeft,
  IconChevronRight,
} from '@tabler/icons-react';

/**
 * Example component showing how to control the sidebar from any component
 */
export default function SidebarControls({ variant = 'buttons' }) {
  const { isCollapsed, toggle, collapse, expand } = useSidebar();

  if (variant === 'single') {
    return (
      <Button
        onClick={toggle}
        variant="outline"
        size="sm"
        leftSection={isCollapsed ? <IconChevronRight size={16} /> : <IconChevronLeft size={16} />}
      >
        {isCollapsed ? 'Expand' : 'Collapse'} Sidebar
      </Button>
    );
  }

  if (variant === 'icon') {
    return (
      <button
        onClick={toggle}
        className="p-2 rounded hover:bg-gray-100 transition-colors"
        title={`${isCollapsed ? 'Expand' : 'Collapse'} sidebar`}
      >
        {isCollapsed ? <IconArrowsMaximize size={16} /> : <IconArrowsMinimize size={16} />}
      </button>
    );
  }

  // Default: separate buttons
  return (
    <div className="flex gap-2">
      <Button
        onClick={collapse}
        variant="outline"
        size="sm"
        disabled={isCollapsed}
        leftSection={<IconArrowsMinimize size={16} />}
      >
        Collapse
      </Button>
      <Button
        onClick={expand}
        variant="outline"
        size="sm"
        disabled={!isCollapsed}
        leftSection={<IconArrowsMaximize size={16} />}
      >
        Expand
      </Button>
    </div>
  );
}
