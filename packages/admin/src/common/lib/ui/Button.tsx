import React from 'react';
import { Button as MantineButton, type ButtonProps } from '@mantine/core';

export type { ButtonProps };

/**
 * Button component - wrapper around Mantine's Button with default radius and size
 */
export const Button = React.forwardRef<
  HTMLButtonElement,
  ButtonProps & React.ComponentPropsWithoutRef<'button'>
>(({ radius = 'md', size = 'md', ...props }, ref) => {
  return <MantineButton ref={ref} radius={radius} size={size} {...props} />;
});

Button.displayName = 'Button';
