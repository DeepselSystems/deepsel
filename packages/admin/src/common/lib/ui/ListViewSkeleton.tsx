import React from 'react';
import { Skeleton } from '@mantine/core';

interface ListViewSkeletonProps {
  /** Number of skeleton rows to display */
  rows?: number;
  /** Height of each skeleton row in pixels */
  rowHeight?: number;
  /** Top margin between rows in pixels */
  margin?: number;
}

/**
 * Skeleton loader for list/table views
 */
export const ListViewSkeleton = ({
  rows = 10,
  rowHeight = 35,
  margin = 8,
}: ListViewSkeletonProps) => {
  return (
    <div>
      {Array(rows)
        .fill(null)
        .map((_, i) => (
          <Skeleton height={rowHeight} mt={margin} key={i} />
        ))}
    </div>
  );
};
