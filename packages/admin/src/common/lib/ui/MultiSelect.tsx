import React from 'react';
import { MultiSelect as MantineMultiSelect, type MultiSelectProps } from '@mantine/core';

export type { MultiSelectProps };

/**
 * MultiSelect component - thin wrapper around Mantine's MultiSelect
 */
export const MultiSelect = ({ radius = 'md', size = 'md', ...props }: MultiSelectProps) => {
  return <MantineMultiSelect radius={radius} size={size} {...props} />;
};
