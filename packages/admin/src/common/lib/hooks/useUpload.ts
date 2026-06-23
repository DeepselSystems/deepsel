import { useState } from 'react';
import { formatErrorDetail } from '../formatErrorDetail';

export interface UseUploadConfig {
  backendHost: string;
  /** JWT token from the authenticated user */
  token: string | undefined;
  /**
   * Organization id used for the `X-Organization-Id` header.
   * Prefer passing the value from the org store so the in-memory default
   * works on fresh login (before anything writes to localStorage).
   */
  organizationId?: number | null;
}

/**
 * Minimal shape returned by the attachment upload endpoint.
 * The backend returns more fields than this; the index signature keeps
 * downstream cast-free access compiling.
 */
export interface UploadedAttachment {
  id: string | number;
  name: string;
  content_type?: string;
  filesize?: number;
  [key: string]: unknown;
}

export interface UseUploadReturn {
  loading: boolean;
  error: string | null;
  uploadFileModel: (
    api: string,
    files: File[] | FileList,
    queryParams?: Record<string, string | number>,
  ) => Promise<UploadedAttachment[]>;
}

/**
 * Hook for uploading files to the backend via multipart form data
 */
export function useUpload(config: UseUploadConfig): UseUploadReturn {
  const { backendHost, token, organizationId } = config;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Uploads one or more files to the given API path.
   * @param api - API path (e.g. "attachment")
   * @param files - Files to upload
   * @param queryParams - Optional query params appended to the URL (e.g. locale_id)
   * @returns Array of uploaded attachments from the server
   */
  async function uploadFileModel(
    api: string,
    files: File[] | FileList,
    queryParams?: Record<string, string | number>,
  ): Promise<UploadedAttachment[]> {
    try {
      setLoading(true);
      setError(null);

      const formData = new FormData();
      Array.from(files).forEach((file) => {
        formData.append('files', file);
      });

      const headers: Record<string, string> = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const orgId =
        organizationId ??
        (typeof window !== 'undefined'
          ? parseInt(localStorage.getItem('organizationId') || '', 10)
          : NaN);
      if (Number.isFinite(orgId)) {
        headers['X-Organization-Id'] = String(orgId);
      }

      let url = `${backendHost}/${api}`;
      if (queryParams) {
        const params = new URLSearchParams(
          Object.fromEntries(Object.entries(queryParams).map(([k, v]) => [k, String(v)])),
        );
        url = `${url}?${params.toString()}`;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: formData,
      });

      if (response.status !== 200) {
        const { detail } = (await response.json()) as { detail: unknown };
        const message = formatErrorDetail(detail);
        setError(message);
        throw new Error(message);
      }

      return (await response.json()) as UploadedAttachment[];
    } finally {
      setLoading(false);
    }
  }

  return {
    loading,
    error,
    uploadFileModel,
  };
}
