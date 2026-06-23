import React from 'react';
import { Link } from 'react-router-dom';
import { Chip } from './Chip';

interface RecordChipDisplayProps {
  name?: React.ReactNode;
  linkTo?: string;
  children?: React.ReactNode;
  /** Mantine size token for font size */
  size?: string;
  [key: string]: unknown;
}

/**
 * Displays a record as a chip with a navigation link
 */
export const RecordChipDisplay = ({
  name,
  linkTo,
  children,
  size = 'md',
  ...props
}: RecordChipDisplayProps) => {
  return (
    <Link
      to={linkTo || ''}
      className="cursor-pointer text-primary-main"
      style={{ fontSize: `var(--mantine-font-size-${size})` }}
      {...(props as Record<string, unknown>)}
    >
      <Chip size="xs" variant="outline" checked={false}>
        {name || children}
      </Chip>
    </Link>
  );
};
