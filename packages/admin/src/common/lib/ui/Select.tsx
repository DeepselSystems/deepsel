import React from 'react';
import { Select as MantineSelect, type SelectProps } from '@mantine/core';

export type { SelectProps };

/**
 * Select component - thin wrapper around Mantine's Select
 */
export const Select = ({ radius = 'md', size = 'md', ...props }: SelectProps) => {
  return <MantineSelect radius={radius} size={size} {...props} />;
};
