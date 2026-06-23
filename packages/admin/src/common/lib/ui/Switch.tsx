import React from 'react';
import { Switch as MantineSwitch, type SwitchProps } from '@mantine/core';

export type { SwitchProps };

/**
 * Switch component - thin wrapper around Mantine's Switch
 */
export const Switch = ({ size = 'md', withThumbIndicator = false, ...props }: SwitchProps) => {
  return <MantineSwitch size={size} withThumbIndicator={withThumbIndicator} {...props} />;
};
