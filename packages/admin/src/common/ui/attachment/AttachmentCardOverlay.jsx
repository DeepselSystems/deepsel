import { ActionIcon, Tooltip } from '@mantine/core';
import clsx from 'clsx';

/**
 * Icon size rendered inside each action button.
 */
const ACTION_ICON_SIZE = 16;

/**
 * @typedef OverlayAction
 * @property {string} key - Unique key for React list rendering
 * @property {React.ElementType} icon - Tabler (or any) icon component
 * @property {string} label - Tooltip label and native title attribute
 * @property {(e: React.MouseEvent) => void} onClick - Click handler
 * @property {string} [color] - Mantine color token (e.g. 'red', 'orange')
 */

/**
 * @typedef AttachmentCardOverlayProps
 * @property {OverlayAction[]} actions - Ordered list of actions to render
 * @property {boolean} [blurred] - Adds backdrop-blur (use for image previews)
 */

/**
 * Semi-transparent hover overlay with icon-only action buttons.
 *
 * Uses ActionIcon + Tooltip so labels are always visible on hover without
 * consuming width — no overflow regardless of how many actions are added.
 *
 * @param {AttachmentCardOverlayProps} props
 */
export function AttachmentCardOverlay({ actions, blurred = false }) {
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
