import React from 'react';
import clsx from 'clsx';

interface H2Props extends React.HTMLAttributes<HTMLHeadingElement> {
  className?: string;
  children?: React.ReactNode;
}

/**
 * H2 heading component with primary color styling
 */
export const H2 = ({ className, children, ...props }: H2Props) => {
  return (
    <h2 className={clsx('text-xl font-[700] text-primary-main', className)} {...props}>
      {children}
    </h2>
  );
};
