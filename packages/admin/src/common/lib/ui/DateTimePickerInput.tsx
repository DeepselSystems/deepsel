import React from 'react';
import { DateTimePicker, type DateTimePickerProps } from '@mantine/dates';

export type { DateTimePickerProps };

/**
 * DateTimePickerInput component - wrapper around Mantine's DateTimePicker with default radius and size
 */
export const DateTimePickerInput = ({
  radius = 'md',
  size = 'md',
  ...props
}: DateTimePickerProps) => {
  return <DateTimePicker radius={radius} size={size} {...props} />;
};
