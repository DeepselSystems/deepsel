/**
 * Constants for the AutocompleteExtension
 */

export const AUTOCOMPLETE_CONSTANTS = {
  DEBOUNCE_DELAY: 2000,

  MIN_TEXT_LENGTH: 3,

  CSS_CLASSES: {
    GHOST_TEXT: 'autocomplete-ghost-text',
    TAB_BADGE: 'autocomplete-tab-badge',
    CONTAINER: 'autocomplete-container',
  },

  TAB_BADGE_TEXT: '⇥ Tab',

  API_ENDPOINT: '/autocomplete/suggest',

  KEYS: {
    TAB: 'Tab',
    ESCAPE: 'Escape',
  },

  EVENTS: {
    DISMISS: 'ai-dismiss',
    SUGGESTION_UPDATE: 'suggestion-update',
  },
} as const;
