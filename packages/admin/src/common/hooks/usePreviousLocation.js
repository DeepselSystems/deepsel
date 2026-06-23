import { useLocation } from 'react-router-dom';
import { useRef, useEffect } from 'react';

export default function usePreviousLocation() {
  const location = useLocation();
  const prevRef = useRef(null);

  useEffect(() => {
    prevRef.current = location;
  }, [location]);

  return prevRef.current;
}
