import React from 'react';
import clsx from 'clsx';

interface ChipColorProps {
  /** Background color value (hex, rgb, css variable, etc.) */
  color?: string;
  /** Text content - defaults to the color value if not provided */
  children?: React.ReactNode;
  className?: string;
}

/**
 * ChipColor - displays a colored chip using Mantine CSS variable typography styles
 */
export const ChipColor = ({ className, color, children }: ChipColorProps) => {
  return (
    <div
      className={clsx('leading-5 rounded-3xl p-1 text-center', className)}
      style={{
        background: color,
        color: `var(--_input-color)`,
        fontFamily: `var(--_input-font-family,var(--mantine-font-family))`,
        fontSize: `var(--_input-fz,var(--input-fz,var(--mantine-font-size-sm)))`,
      }}
    >
      {children || color}
    </div>
  );
};
