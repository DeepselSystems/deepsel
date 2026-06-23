import React from 'react';
import { Skeleton } from '@mantine/core';

interface ChartViewSkeletonProps {
  /** Height of the skeleton in pixels */
  height?: number;
}

/**
 * ChartViewSkeleton - placeholder skeleton while chart data is loading
 */
export const ChartViewSkeleton = ({ height = 300 }: ChartViewSkeletonProps) => {
  return <Skeleton height={height} radius="sm" />;
};
