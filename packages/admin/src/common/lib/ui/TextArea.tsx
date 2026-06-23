import React from 'react';
import { Textarea as MantineTextarea, type TextareaProps } from '@mantine/core';

export type { TextareaProps };

/**
 * TextArea component - thin wrapper around Mantine's Textarea
 */
export const TextArea = ({ radius = 'md', size = 'md', ...props }: TextareaProps) => {
  return <MantineTextarea radius={radius} size={size} {...props} />;
};
