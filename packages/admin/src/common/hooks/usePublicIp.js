import { useState } from 'react';
import useEffectOnce from './useEffectOnce.js';

const PROVIDER_ENDPOINT = 'https://api.ipify.org?format=json';

/**
 * Custom React hook to fetch the client's public IP address from ipify.org.
 */
const usePublicIp = () => {
  const [ip, setIp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /**
   * Get ip processing
   */
  useEffectOnce(() => {
    let isMounted = true; // Prevent state updates after unmount

    async function fetchIp() {
      try {
        setLoading(true);
        const res = await fetch(PROVIDER_ENDPOINT);
        if (!res.ok) {
          console.error('Failed to fetch IP');
          setError('Failed to fetch IP');
          return;
        }
        const data = await res.json();
        if (isMounted) {
          setIp(data.ip);
          setError(null);
        }
      } catch (err) {
        if (isMounted) setError(err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchIp().then();

    return () => {
      isMounted = false;
    };
  });

  return { ip, loading, error };
};

export default usePublicIp;
