import React, { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';

interface MasonryProps {
  children: React.ReactNode;
  /** Number of columns */
  columns?: number;
  className?: string;
}

/**
 * Masonry layout component that arranges items in columns using shortest-column-first algorithm
 */
export const Masonry = ({ children, columns = 5, className = '' }: MasonryProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [columnWrappers, setColumnWrappers] = useState<React.ReactNode[][]>([]);

  useEffect(() => {
    const items = Array.isArray(children) ? children : [children];
    const validItems = (items as React.ReactNode[]).filter((item) => item != null);

    /** Distribute items into columns using shortest column first algorithm */
    const cols: React.ReactNode[][] = Array.from({ length: columns }, () => []);
    const columnHeights = Array.from({ length: columns }, () => 0);

    validItems.forEach((item) => {
      const minHeightIndex = columnHeights.indexOf(Math.min(...columnHeights));
      cols[minHeightIndex].push(item);
      columnHeights[minHeightIndex] += 1;
    });

    setColumnWrappers(cols);
  }, [children, columns]);

  return (
    <div
      ref={containerRef}
      className={clsx('flex gap-1', className)}
      style={{ alignItems: 'flex-start' }}
    >
      {columnWrappers.map((column, columnIndex) => (
        <div key={columnIndex} className="flex flex-col gap-3 flex-1" style={{ minWidth: 0 }}>
          {column.map((item, itemIndex) => (
            <div key={itemIndex}>{item}</div>
          ))}
        </div>
      ))}
    </div>
  );
};
