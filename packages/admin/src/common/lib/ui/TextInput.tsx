import React from 'react';
import { TextInput as MantineTextInput, type TextInputProps } from '@mantine/core';

export type { TextInputProps };

/**
 * TextInput component - thin wrapper around Mantine's TextInput
 */
export const TextInput = ({ radius = 'md', size = 'md', ...props }: TextInputProps) => {
  return <MantineTextInput radius={radius} size={size} {...props} />;
};
