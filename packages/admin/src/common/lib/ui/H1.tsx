import React from 'react';
import clsx from 'clsx';

interface H1Props extends React.HTMLAttributes<HTMLHeadingElement> {
  className?: string;
  children?: React.ReactNode;
}

/**
 * H1 heading component with primary color styling
 */
export const H1 = ({ className, children, ...props }: H1Props) => {
  return (
    <h1 className={clsx('text-3xl font-[700] text-primary-main', className)} {...props}>
      {children}
    </h1>
  );
};
