import React from 'react';
import clsx from 'clsx';

interface H3Props extends React.HTMLAttributes<HTMLHeadingElement> {
  className?: string;
  children?: React.ReactNode;
}

/**
 * H3 heading component with primary color styling
 */
export const H3 = ({ className, children, ...props }: H3Props) => {
  return (
    <h3 className={clsx('text-lg font-[600] text-primary-main', className)} {...props}>
      {children}
    </h3>
  );
};
