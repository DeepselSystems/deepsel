import React from 'react';
import { NumberInput as MantineNumberInput, type NumberInputProps } from '@mantine/core';

export type { NumberInputProps };

/**
 * NumberInput component - thin wrapper around Mantine's NumberInput
 */
export const NumberInput = ({ radius = 'md', size = 'md', ...props }: NumberInputProps) => {
  return <MantineNumberInput radius={radius} size={size} {...props} />;
};
