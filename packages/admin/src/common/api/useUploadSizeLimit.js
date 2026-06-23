import { useEffect, useState, useRef, useCallback } from 'react';
import useFetch from './useFetch.js';

// Global cache to prevent multiple API calls
let globalUploadConfig = null;
let globalPromise = null;

/**
 * Custom hook to fetch upload size limit from API
 * Uses global caching to prevent multiple API calls
 * @returns {Object} - Upload size limit configuration
 */
export default function useUploadSizeLimit() {
  const [uploadSizeLimit, setUploadSizeLimit] = useState(globalUploadConfig?.uploadSizeLimit || 5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [refetchTick, setRefetchTick] = useState(0);
  const hasInitialized = useRef(false);

  const { get } = useFetch('attachment/config/upload_size_limit', {
    autoFetch: false,
    redirectLoginIfUnauthorized: false,
  });

  useEffect(() => {
    // If already initialized or global config exists, don't fetch again
    if (hasInitialized.current || globalUploadConfig) {
      if (globalUploadConfig) {
        setUploadSizeLimit(globalUploadConfig.uploadSizeLimit);
        setError(globalUploadConfig.error);
      }
      return;
    }

    // If there's already a pending request, wait for it
    if (globalPromise) {
      globalPromise.then((config) => {
        setUploadSizeLimit(config.uploadSizeLimit);
        setError(config.error);
        setLoading(false);
      });
      return;
    }

    // Mark as initialized and start fetching
    hasInitialized.current = true;
    setLoading(true);

    // Create the promise for other hooks to wait for
    globalPromise = (async () => {
      try {
        const result = await get();
        let sizeLimit = 5; // Default

        if (result?.success && result?.filename) {
          // Parse filename to get size limit (assuming filename contains size info)
          // If API returns size directly, adjust this logic
          sizeLimit = parseFloat(result.filename) || 5;
        }

        const config = {
          uploadSizeLimit: sizeLimit,
          error: null,
        };

        // Cache globally
        globalUploadConfig = config;
        return config;
      } catch (err) {
        console.warn('Failed to fetch upload config, using default 5MB:', err);
        const config = {
          uploadSizeLimit: 5,
          error: err,
        };

        // Cache globally even on error
        globalUploadConfig = config;
        return config;
      }
    })();

    // Wait for the result
    globalPromise
      .then((config) => {
        setUploadSizeLimit(config.uploadSizeLimit);
        setError(config.error);
      })
      .finally(() => {
        setLoading(false);
        // Clear the promise after completion
        globalPromise = null;
      });
  }, [get, refetchTick]);

  const reFetch = useCallback(async () => {
    // Clear global cache and re-fetch
    globalUploadConfig = null;
    globalPromise = null;
    hasInitialized.current = false;
    setLoading(true);
    // Bump the tick so the effect re-runs even though `get` is stable.
    setRefetchTick((t) => t + 1);
  }, []);

  return {
    uploadSizeLimit,
    loading,
    error,
    reFetch,
  };
}
