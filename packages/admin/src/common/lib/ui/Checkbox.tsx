import React from 'react';
import { Checkbox as MantineCheckbox, type CheckboxProps } from '@mantine/core';

export type { CheckboxProps };

/**
 * Checkbox component - wrapper around Mantine's Checkbox with default radius and size
 */
export const Checkbox = ({ radius = 'md', size = 'md', ...props }: CheckboxProps) => {
  return <MantineCheckbox radius={radius} size={size} {...props} />;
};
