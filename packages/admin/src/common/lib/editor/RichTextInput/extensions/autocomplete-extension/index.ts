/**
 * Enhanced Autocomplete Extension for Tiptap
 *
 * Features:
 * - Tab to accept suggestion at once (not character by character)
 * - Shows "Tab" badge at end of ghost text
 * - Cancel pending API requests on every keystroke
 * - Uses 1000ms debounce
 * - Integrates with existing API endpoint
 */

export { default as AutocompleteExtension } from './AutocompleteExtension';
export { useAutocomplete } from './hooks/useAutocomplete';
export { useDebounce } from './hooks/useDebounce';
export { default as TabBadge } from './components/TabBadge';
export { AUTOCOMPLETE_CONSTANTS } from './constants';
export {
  isIncompleteSentence,
  createGhostTextCSS,
  escapeHTML,
  debounce as utilDebounce,
  isRelevantKey,
} from './utils';

export { default } from './AutocompleteExtension';
