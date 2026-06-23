import React from 'react';
import { ActionIcon, Tooltip } from '@mantine/core';
import clsx from 'clsx';

/**
 * Icon size rendered inside each action button.
 */
const ACTION_ICON_SIZE = 16;

export interface OverlayAction {
  /** Unique key for React list rendering */
  key: string;
  /** Tabler (or any) icon component */
  icon: React.ElementType;
  /** Tooltip label and native title attribute */
  label: string;
  onClick: (e: React.MouseEvent) => void;
  /** Mantine color token (e.g. 'red', 'orange') */
  color?: string;
}

interface AttachmentCardOverlayProps {
  actions: OverlayAction[];
  /** Adds backdrop-blur — use for image previews */
  blurred?: boolean;
}

/**
 * Semi-transparent hover overlay with icon-only action buttons.
 * Uses ActionIcon + Tooltip so labels are always visible on hover without consuming width.
 */
export function AttachmentCardOverlay({ actions, blurred = false }: AttachmentCardOverlayProps) {
  return (
    <div
      className={clsx(
        'absolute inset-0 flex flex-wrap items-center justify-center gap-1.5 p-2',
        'bg-black/30',
        blurred && 'backdrop-blur-sm',
      )}
    >
      {actions.map(({ key, icon: Icon, label, onClick, color }) => (
        <Tooltip key={key} label={label} withArrow>
          <ActionIcon
            size="sm"
            variant="filled"
            color={color}
            title={label}
            aria-label={label}
            onClick={onClick}
          >
            <Icon size={ACTION_ICON_SIZE} />
          </ActionIcon>
        </Tooltip>
      ))}
    </div>
  );
}
