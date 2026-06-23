import React from 'react';
import { Radio as MantineRadio, type RadioProps } from '@mantine/core';

export type { RadioProps };

/**
 * Radio component - thin wrapper around Mantine's Radio
 */
export const Radio = (props: RadioProps) => {
  return <MantineRadio {...props} />;
};
