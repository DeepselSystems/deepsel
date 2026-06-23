import React from 'react';
import { Divider as MantineDivider, type DividerProps } from '@mantine/core';

export type { DividerProps };

/**
 * Divider component - thin wrapper around Mantine's Divider
 */
export const Divider = (props: DividerProps) => {
  return <MantineDivider {...props} />;
};
