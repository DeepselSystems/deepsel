import React from 'react';
import { Skeleton } from '@mantine/core';

/**
 * Skeleton loader for form views
 */
export const FormViewSkeleton = () => {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton height={40} />
      <Skeleton height={200} />
    </div>
  );
};
