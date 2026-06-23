import { useEffect, useRef } from 'react';

export default function useEffectOnce(fn) {
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
