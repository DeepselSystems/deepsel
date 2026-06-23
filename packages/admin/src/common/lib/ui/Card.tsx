import React from 'react';
import clsx from 'clsx';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverEffect?: boolean;
}

/**
 * Card component - styled container with border, shadow, and rounded corners
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const Card = ({ className, hoverEffect: _hoverEffect, ...props }: CardProps) => {
  return (
    <div
      className={clsx(
        'bg-white rounded-xl border border-gray-300 shadow-lg cursor-auto p-6',
        className,
      )}
      {...props}
    />
  );
};
