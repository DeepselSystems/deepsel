import React from 'react';
import clsx from 'clsx';

interface ColorDisplayProps {
  /** Color value used for the swatch background */
  color?: string;
  /** Text label - defaults to the color value if not provided */
  value?: string;
  className?: string;
}

/**
 * ColorDisplay - shows a circular color swatch alongside a text label
 */
export const ColorDisplay = ({ color, value, className }: ColorDisplayProps) => {
  return (
    <div className={clsx('flex items-center', className)}>
      <div className="rounded-full w-5 h-5" style={{ background: color }} />
      <div
        className="ml-1 leading-5"
        style={{
          color: `var(--_input-color)`,
          fontFamily: `var(--_input-font-family,var(--mantine-font-family))`,
          fontSize: `var(--_input-fz,var(--input-fz,var(--mantine-font-size-sm)))`,
        }}
      >
        {value || color}
      </div>
    </div>
  );
};
