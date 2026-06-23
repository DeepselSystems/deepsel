import React from 'react';
import { PasswordInput as MantinePasswordInput, type PasswordInputProps } from '@mantine/core';

export type { PasswordInputProps };

/**
 * PasswordInput component - thin wrapper around Mantine's PasswordInput
 */
export const PasswordInput = ({ radius = 'md', size = 'md', ...props }: PasswordInputProps) => {
  return <MantinePasswordInput radius={radius} size={size} {...props} />;
};
