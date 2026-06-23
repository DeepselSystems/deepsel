import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { isObjectOrArray } from '@deepsel/cms-utils';

/**
 * Empty-value sentinels for URL search params
 */
const SearchParamEmptyTypes = ['', null, undefined] as const;

/**
 * Parses a raw URL search-param string back to the original type inferred from
 * the initial value.  Falls back to the raw string if conversion fails.
 */
function convertToOriginalType(value: string | null | undefined, initialType: string): unknown {
  const isEmpty = (SearchParamEmptyTypes as ReadonlyArray<unknown>).includes(value);
  if (isEmpty) return '';

  const printWarning = () => {
    console.warn(
      `Cannot be converted to original value type. Initial type: ${initialType}, value to convert: ${value}, of type: ${typeof value}`,
    );
  };

  switch (initialType) {
    case 'number': {
      const valueNumber = Number(value);
      if (isNaN(valueNumber)) {
        printWarning();
        return value;
      }
      return valueNumber;
    }
    case 'boolean': {
      const valueBool = String(value).toLowerCase();
      if ([String(true), String(false)].includes(valueBool)) {
        return valueBool === 'true';
      }
      printWarning();
      return value;
    }
    case 'object':
      try {
        if (typeof value === 'string') {
          if (value.trim() === '') return '';
          return JSON.parse(value);
        }
        return value;
      } catch {
        printWarning();
        return value;
      }
    default:
      return value;
  }
}

/**
 * Synchronises a React state value with a URL search parameter.
 * Changes to the URL are reflected in state, and state updates are written
 * back to the URL.
 *
 * @param searchQueryKey - The URL search parameter key to sync with
 * @param initialValue   - Initial / default value (also determines the type)
 * @returns [currentValue, setter]
 */
export function useSearchParamState<T>(
  searchQueryKey: string,
  initialValue: T,
): [T, (newState: T) => void] {
  const initialType = isObjectOrArray(initialValue) ? 'object' : typeof initialValue;

  const [searchParams, setSearchParams] = useSearchParams();

  const [state, setState] = React.useState<T>(() => {
    const paramValue = searchParams.get(searchQueryKey);
    return (SearchParamEmptyTypes as ReadonlyArray<unknown>).includes(paramValue)
      ? initialValue
      : (convertToOriginalType(paramValue, initialType) as T);
  });

  /**
   * Updates both the local state and the URL search parameter
   */
  const updateState = React.useCallback(
    (newState: T) => {
      const newSearchParams = new URLSearchParams(searchParams);
      const newStateAsString = isObjectOrArray(newState)
        ? JSON.stringify(newState)
        : String(newState);
      newSearchParams.set(searchQueryKey, newStateAsString);
      setSearchParams(newSearchParams);
      setState(convertToOriginalType(newState as unknown as string, initialType) as T);
    },
    [initialType, searchQueryKey, searchParams, setSearchParams],
  );

  /**
   * Keeps local state in sync when the URL search param changes externally
   */
  React.useEffect(() => {
    const paramValue = convertToOriginalType(searchParams.get(searchQueryKey), initialType) as T;

    setState((prevState) => {
      const isDifferent = String(paramValue) !== String(prevState);
      const isNotEmpty = !(SearchParamEmptyTypes as ReadonlyArray<unknown>).includes(paramValue);
      return isDifferent && isNotEmpty ? paramValue : prevState;
    });
  }, [initialType, searchParams, searchQueryKey]);

  return [state, updateState];
}
