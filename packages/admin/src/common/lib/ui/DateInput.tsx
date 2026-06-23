import React from 'react';
import { DateInput as MantineDateInput, type DateInputProps } from '@mantine/dates';

export type { DateInputProps };

/**
 * DateInput component - thin wrapper around Mantine's DateInput
 */
export const DateInput = (props: DateInputProps) => {
  return <MantineDateInput {...props} />;
};
