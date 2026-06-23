import { useState, useCallback, useRef, useEffect } from 'react';
import { useDebounce } from './useDebounce';
import { AUTOCOMPLETE_CONSTANTS } from '../constants';
import { isIncompleteSentence } from '../utils';

interface UseAutocompleteConfig {
  backendHost: string;
  token: string;
  onSuggestionUpdate?: (suggestion: string) => void;
}

interface UseAutocompleteReturn {
  suggestion: string;
  isLoading: boolean;
  triggerAutocomplete: (text: string, position: number) => void;
  acceptSuggestion: () => string;
  dismissSuggestion: () => void;
  cancelAll: () => void;
}

/**
 * Custom hook for managing autocomplete functionality
 * @param {Object} config - Configuration object
 * @param {string} config.backendHost - Backend host URL
 * @param {string} config.token - Authentication token
 * @param {Function} config.onSuggestionUpdate - Callback when suggestion updates
 * @returns {Object} - Autocomplete state and functions
 */
export function useAutocomplete({
  backendHost,
  token,
  onSuggestionUpdate,
}: UseAutocompleteConfig): UseAutocompleteReturn {
  const [suggestion, setSuggestion] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const { debouncedCallback, cancel } = useDebounce(async (text: string, position: number) => {
    await fetchSuggestion(text, position);
  }, AUTOCOMPLETE_CONSTANTS.DEBOUNCE_DELAY);

  /**
   * Fetch AI suggestion from API
   * @param {string} text - Current text content
   * @param {number} position - Cursor position
   */
  const fetchSuggestion = useCallback(
    async (text: string, position: number) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      if (!isIncompleteSentence(text, position)) {
        setSuggestion('');
        onSuggestionUpdate?.('');
        return;
      }

      abortControllerRef.current = new AbortController();

      try {
        setIsLoading(true);

        const orgId =
          typeof window !== 'undefined'
            ? parseInt(localStorage.getItem('organizationId') || '', 10)
            : NaN;
        const response = await fetch(`${backendHost}${AUTOCOMPLETE_CONSTANTS.API_ENDPOINT}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            ...(Number.isFinite(orgId) ? { 'X-Organization-Id': String(orgId) } : {}),
          },
          body: JSON.stringify({
            text,
            cursor_position: position,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        const newSuggestion = data.completion || data.suggestions?.[0] || '';

        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        setSuggestion(newSuggestion);

        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        onSuggestionUpdate?.(newSuggestion);
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error('Error fetching autocomplete suggestions:', error);
        }

        setSuggestion('');
        onSuggestionUpdate?.('');
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [backendHost, token, onSuggestionUpdate],
  );

  /**
   * Trigger autocomplete check
   * @param {string} text - Current text content
   * @param {number} position - Cursor position
   */
  const triggerAutocomplete = useCallback(
    (text: string, position: number) => {
      debouncedCallback(text, position);
    },
    [debouncedCallback],
  );

  /**
   * Accept the current suggestion
   * @returns {string} - The accepted suggestion
   */
  const acceptSuggestion = useCallback(() => {
    const currentSuggestion = suggestion;
    setSuggestion('');
    onSuggestionUpdate?.('');
    return currentSuggestion;
  }, [suggestion, onSuggestionUpdate]);

  /**
   * Dismiss the current suggestion
   */
  const dismissSuggestion = useCallback(() => {
    setSuggestion('');
    onSuggestionUpdate?.('');

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    cancel();
  }, [onSuggestionUpdate, cancel]);

  /**
   * Cancel any pending requests and debounced callbacks
   */
  const cancelAll = useCallback(() => {
    dismissSuggestion();
  }, [dismissSuggestion]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      cancel();
    };
  }, [cancel]);

  return {
    suggestion,
    isLoading,
    triggerAutocomplete,
    acceptSuggestion,
    dismissSuggestion,
    cancelAll,
  };
}
