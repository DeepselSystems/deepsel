import React from 'react';
import { Link } from 'react-router-dom';
import { IconArrowRight } from '@tabler/icons-react';

interface RecordDisplayProps {
  label?: React.ReactNode;
  value?: React.ReactNode;
  linkTo?: string;
  children?: React.ReactNode;
  /** Mantine size token for font size */
  size?: string;
  [key: string]: unknown;
}

/**
 * Read-only record field with a link to navigate to the related record
 */
export const RecordDisplay = ({
  label,
  value,
  linkTo,
  children,
  size = 'md',
  ...props
}: RecordDisplayProps) => {
  return (
    <div {...props}>
      <div
        style={{
          fontSize: `var(--input-label-size,var(--mantine-font-size-${size}))`,
          fontWeight: 500,
        }}
      >
        {label}
      </div>
      <Link
        to={linkTo || ''}
        className="cursor-pointer text-primary-main"
        style={{ fontSize: `var(--mantine-font-size-${size})` }}
      >
        {children || value}
        {(children || value) && <IconArrowRight size={16} className="ml-1" />}
      </Link>
    </div>
  );
};
