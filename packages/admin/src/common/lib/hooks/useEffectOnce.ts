import { useEffect, useRef } from 'react';

/**
 * Runs an effect exactly once on mount, regardless of StrictMode double-invocation
 * @param fn - The effect callback to run once
 */
export function useEffectOnce(fn: () => void): void {
  const ref = useRef(true);
  useEffect(() => {
    if (ref.current) {
      fn();
    }
    return () => {
      ref.current = false;
    };
  }, []);
}
