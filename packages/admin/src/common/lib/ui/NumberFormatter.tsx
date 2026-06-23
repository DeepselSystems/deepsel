import React from 'react';
import {
  NumberFormatter as MantineNumberFormatter,
  type NumberFormatterProps,
} from '@mantine/core';

export type { NumberFormatterProps };

/**
 * NumberFormatter component - thin wrapper around Mantine's NumberFormatter
 */
export const NumberFormatter = (props: NumberFormatterProps) => {
  return <MantineNumberFormatter {...props} />;
};
