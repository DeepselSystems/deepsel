import React from 'react';
import { AUTOCOMPLETE_CONSTANTS } from '../constants';

/**
 * Tab badge component to show at the end of ghost text
 * @component
 */
export default function TabBadge() {
  return (
    <span
      className={AUTOCOMPLETE_CONSTANTS.CSS_CLASSES.TAB_BADGE}
      style={{
        opacity: 0.6,
        fontSize: '0.8em',
        marginLeft: '2px',
        pointerEvents: 'none',
        userSelect: 'none',
        color: '#666',
        backgroundColor: '#f0f0f0',
        padding: '1px 4px',
        borderRadius: '3px',
        border: '1px solid #ddd',
        fontFamily: 'monospace',
      }}
    >
      {AUTOCOMPLETE_CONSTANTS.TAB_BADGE_TEXT}
    </span>
  );
}
