import React from 'react';
import { Badge as MantineBadge, type BadgeProps } from '@mantine/core';

export type { BadgeProps };

/**
 * Badge component - thin wrapper around Mantine's Badge
 */
export const Badge = (props: BadgeProps) => {
  return <MantineBadge {...props} />;
};
