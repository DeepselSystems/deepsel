import React from 'react';
import { Chip as MantineChip, type ChipProps } from '@mantine/core';

export type { ChipProps };

/**
 * Chip component - thin wrapper around Mantine's Chip
 */
export const Chip = ({ children, ...props }: ChipProps) => {
  return <MantineChip {...props}>{children}</MantineChip>;
};
