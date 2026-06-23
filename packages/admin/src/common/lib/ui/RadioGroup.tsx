import React from 'react';
import { Radio as MantineRadio, type RadioGroupProps } from '@mantine/core';

export type { RadioGroupProps };

/**
 * RadioGroup component - thin wrapper around Mantine's Radio.Group
 */
export const RadioGroup = (props: RadioGroupProps) => {
  return <MantineRadio.Group {...props} />;
};
