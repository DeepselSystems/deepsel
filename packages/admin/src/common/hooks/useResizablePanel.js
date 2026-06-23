import { useState, useCallback, useEffect } from 'react';

/**
 * Custom hook for handling resizable panel functionality
 * @param {Object} options - Configuration options
 * @param {number} options.initialWidth - Initial width of the panel (default: 400)
 * @param {number} options.minWidth - Minimum width constraint (default: 300)
 * @param {number} options.maxWidth - Maximum width constraint (default: 800)
 * @returns {Object} - Resize state and handlers
 */
export default function useResizablePanel({
  initialWidth = 400,
  minWidth = 300,
  maxWidth = 800,
} = {}) {
  const [width, setWidth] = useState(initialWidth);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartWidth, setDragStartWidth] = useState(0);

  const handleMouseDown = useCallback(
    (e) => {
      setIsResizing(true);
      setDragStartX(e.clientX);
      setDragStartWidth(width);
      e.preventDefault();
    },
    [width],
  );

  const handleMouseMove = useCallback(
    (e) => {
      if (!isResizing) return;
      e.preventDefault();

      const deltaX = e.clientX - dragStartX;
      const newWidth = dragStartWidth + deltaX;

      if (newWidth >= minWidth && newWidth <= maxWidth) {
        setWidth(newWidth);
      }
    },
    [isResizing, dragStartX, dragStartWidth, minWidth, maxWidth],
  );

  const handleMouseUp = useCallback((e) => {
    e.preventDefault();
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isResizing, handleMouseMove, handleMouseUp]);

  return {
    width,
    isResizing,
    handleMouseDown,
    setWidth,
  };
}
