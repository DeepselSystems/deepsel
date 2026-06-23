import React from 'react';
import { useSearchParamState } from './useSearchParamState';

/**
 * Manages a numeric pagination parameter, with optional sync to the URL.
 *
 * @param searchQueryKey - URL search param key (e.g. "page")
 * @param initialValue   - Default page / limit value
 * @returns [currentValue, setter]
 */
export function usePagingTableParams(
  searchQueryKey: string,
  initialValue: number,
): [number, (newState: number) => void] {
  const [searchParamState, setSearchParamState] = useSearchParamState(searchQueryKey, initialValue);

  const [state, setState] = React.useState<number>(() => searchParamState || initialValue);

  /**
   * Updates both the URL search param and local state
   */
  const updateState = React.useCallback(
    (newState: number) => {
      setSearchParamState(newState);
      setState(newState);
    },
    [setSearchParamState],
  );

  /**
   * Keeps local state valid — resets to initialValue if URL param becomes NaN / ≤0
   */
  React.useEffect(() => {
    const stateNumber = Number(searchParamState);
    if (isNaN(stateNumber) || stateNumber <= 0) {
      setState(initialValue);
    } else {
      setState(stateNumber);
    }
  }, [initialValue, searchParamState]);

  return [state, updateState];
}
