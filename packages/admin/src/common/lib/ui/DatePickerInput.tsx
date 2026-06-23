import React from 'react';
import {
  DatePickerInput as MantineDatePickerInput,
  type DatePickerInputProps,
} from '@mantine/dates';

export type { DatePickerInputProps };

/**
 * DatePickerInput component - thin wrapper around Mantine's DatePickerInput
 */
export const DatePickerInput = (props: DatePickerInputProps) => {
  return <MantineDatePickerInput {...props} />;
};
