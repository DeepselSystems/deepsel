import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { User } from '../types';
import { formatErrorDetail } from '../formatErrorDetail';

export interface UseFetchConfig {
  backendHost: string;
  /** setUser from UserState store — used to clear session on 401 */
  setUser: (user: User | null) => void;
}

export interface UseFetchOptions {
  autoFetch?: boolean;
  params?: Record<string, unknown> | null;
  redirectLoginIfUnauthorized?: boolean;
}

export interface UseFetchReturn<T = unknown, R = unknown> {
  data: T[];
  setData: React.Dispatch<React.SetStateAction<T[]>>;
  record: R | null;
  setRecord: React.Dispatch<React.SetStateAction<R | null>>;
  loading: boolean;
  error: Error | null;
  get: () => Promise<T[] | R | undefined>;
  post: (data: unknown, options?: { path?: string }) => Promise<R | undefined>;
  put: (data: unknown, options?: { path?: string }) => Promise<R | undefined>;
  del: (path?: string) => Promise<void>;
  params: Record<string, unknown> | null;
  setParams: React.Dispatch<React.SetStateAction<Record<string, unknown> | null>>;
}

/**
 * Generic data-fetching hook with GET / POST / PUT / DELETE support,
 * automatic 401 handling, and optional auto-fetch on param changes.
 *
 * Uses httpOnly session cookies for auth — no manual token management.
 *
 * @param url    - Default API path (e.g. "attachment/config/upload_size_limit")
 * @param config - Runtime DI config (backendHost, setUser)
 * @param options - Per-call options (autoFetch, params, redirectLoginIfUnauthorized)
 */
export function useFetch<T = unknown, R = unknown>(
  url: string,
  config: UseFetchConfig,
  {
    autoFetch = false,
    params: paramsProp = null,
    redirectLoginIfUnauthorized = true,
  }: UseFetchOptions = {},
): UseFetchReturn<T, R> {
  const { backendHost, setUser } = config;

  const navigate = useNavigate();
  const [data, setData] = useState<T[]>([]);
  const [record, setRecord] = useState<R | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [params, setParams] = useState<Record<string, unknown> | null>(paramsProp);
  const location = useLocation();
  const currentPath = location.pathname;

  useEffect(() => {
    if (autoFetch) {
      void fetchData();
    }
  }, [params]);

  async function fetchCommon({
    method = 'GET',
    path = url,
    data,
  }: {
    method?: string;
    path?: string;
    data?: unknown;
  }) {
    try {
      let endpoint = `${backendHost}/${path}`;
      const isFormData = data instanceof FormData;
      const headers: Record<string, string> = isFormData
        ? {}
        : { 'Content-Type': 'application/json' };

      if (typeof window !== 'undefined') {
        const organizationId = parseInt(localStorage.getItem('organizationId') || '', 10);
        if (Number.isFinite(organizationId)) {
          headers['X-Organization-Id'] = organizationId.toString();
        }
      }

      const fetchOptions: RequestInit = {
        method,
        headers,
        credentials: 'include',
      };

      if (method !== 'GET' && data) {
        fetchOptions.body = isFormData ? data : JSON.stringify(data);
      } else if (method === 'GET' && data) {
        const queryString = new URLSearchParams(data as Record<string, string>).toString();
        endpoint = `${endpoint}?${queryString}`;
      }

      const response = await fetch(endpoint, fetchOptions);

      if (response.status === 401) {
        await resetAuth();
        return;
      }

      if (!response.ok) {
        const errorBody = (await response.json()) as { detail?: unknown };
        throw new Error(
          errorBody?.detail !== undefined
            ? formatErrorDetail(errorBody.detail)
            : JSON.stringify(errorBody),
        );
      }

      return (await response.json()) as T[] | R;
    } catch (error) {
      console.error(error);
      throw new Error(String(error));
    }
  }

  async function resetAuth() {
    setUser(null);
    console.warn('useFetch.resetAuth redirect to login');
    if (redirectLoginIfUnauthorized) {
      void navigate(`/login?redirect=${currentPath}`);
    }
  }

  /**
   * Fetches data using the configured URL and params (mapped to GET).
   */
  async function fetchData(): Promise<T[] | R | undefined> {
    setLoading(true);
    try {
      const result = await fetchCommon({ data: params ?? undefined });
      if (Array.isArray(result)) {
        setData(result);
      } else {
        setRecord(result as R);
      }

      setError(null);

      return result as T[] | R;
    } catch (error) {
      setError(error as Error);
      console.error(error);
      throw new Error(String(error));
    } finally {
      setLoading(false);
    }
  }

  /**
   * Sends a POST request to the given path (or default URL).
   */
  async function post(data: unknown, { path }: { path?: string } = {}): Promise<R | undefined> {
    setLoading(true);
    try {
      const result = await fetchCommon({ method: 'POST', path, data });
      setRecord(result as R);
      return result as R;
    } finally {
      setLoading(false);
    }
  }

  /**
   * Sends a PUT request to the given path (or default URL).
   */
  async function put(data: unknown, { path }: { path?: string } = {}): Promise<R | undefined> {
    setLoading(true);
    try {
      const result = await fetchCommon({ method: 'PUT', path, data });
      setRecord(result as R);
      return result as R;
    } finally {
      setLoading(false);
    }
  }

  /**
   * Sends a DELETE request to the given path (or default URL).
   */
  async function del(path?: string): Promise<void> {
    setLoading(true);
    try {
      await fetchCommon({ method: 'DELETE', path });
    } finally {
      setLoading(false);
    }
  }

  return {
    data,
    setData,
    record,
    setRecord,
    loading,
    error,
    get: fetchData,
    post,
    put,
    del,
    params,
    setParams,
  };
}
