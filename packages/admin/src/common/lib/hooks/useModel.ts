import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { modals } from '@mantine/modals';
import { Alert } from '@mantine/core';
import React from 'react';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { PagingTableParams } from '@deepsel/cms-utils';
import type { User } from '../types';
import { H2 } from '../ui';
import { extractDeletedIds } from './extractDeletedIds';
import { useSearchParamState } from './useSearchParamState';
import { usePagingTableParams } from './usePagingTableParams';
import { formatErrorDetail } from '../formatErrorDetail';

dayjs.extend(utc);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FilterCondition {
  field: string;
  operator: string;
  value: unknown;
}

export interface OrderBy {
  field: string;
  direction: 'asc' | 'desc';
}

export interface UseModelConfig {
  backendHost: string;
  /** Authenticated user — auth is via httpOnly session cookie */
  user: User | null;
  setUser: (user: User | null) => void;
  organizationId?: number | null;
  /** Optional i18n translate function */
  t?: (key: string) => string;
}

export interface UseModelOptions {
  id?: string | number | null;
  autoFetch?: boolean;
  syncPagingParamsWithURL?: boolean;
  searchFields?: string[];
  page?: number;
  pageSize?: number | null;
  filters?: FilterCondition[];
  orderBy?: OrderBy;
  redirectLoginIfUnauthorized?: boolean;
  abortPreviousRequest?: boolean;
  /** Client-side filter applied after data is loaded from the API */
  filterAfterLoad?: ((item: unknown) => boolean) | null;
}

export interface UseModelReturn<T = Record<string, unknown>> {
  modelName: string;
  data: T[];
  setData: React.Dispatch<React.SetStateAction<T[]>>;
  originalData: T[];
  setOriginalData: React.Dispatch<React.SetStateAction<T[]>>;
  record: T | null;
  setRecord: React.Dispatch<React.SetStateAction<T | null>>;
  loading: boolean;
  error: string | null;
  // CRUD
  get: (
    queryObject?: Record<string, unknown> | null,
  ) => Promise<{ data: T[]; total: number } | undefined>;
  getOne: (id: string | number) => Promise<T | undefined>;
  create: (newItem: Partial<T>) => Promise<T | undefined>;
  update: (updatedItem: Partial<T> & { id: string | number }) => Promise<T | undefined>;
  del: (recordId: string | number, force?: boolean) => Promise<void>;
  bulkDelete: (queryObject?: Record<string, unknown>, force?: boolean) => Promise<void>;
  deleteWithConfirm: (
    recordIds: Array<string | number>,
    callback?: (() => void) | null,
    onErr?: ((e: unknown) => void) | null,
  ) => Promise<void>;
  exportCSV: (selectedRows?: Array<{ id: string | number }> | null) => Promise<Blob | undefined>;
  importCSV: (file: File) => Promise<unknown>;
  uploadFile: (file: File, attachmentIdField: string, rcd?: T | null) => Promise<unknown>;
  // Pagination
  page: number;
  setPage: (page: number) => void;
  pageSize: number | null;
  setPageSize: (size: number) => void;
  total: number;
  // Filter / search
  filters: FilterCondition[];
  setFilters: (filters: FilterCondition[]) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  orderBy: OrderBy;
  setOrderBy: (orderBy: OrderBy) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the string looks like a naïve ISO datetime (no timezone)
 */
function isISODateString(str: unknown): str is string {
  if (typeof str !== 'string') return false;
  const isoDatePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{6})?$/;
  return isoDatePattern.test(str);
}

// ---------------------------------------------------------------------------
// Inner paging hook — always calls both state variants, picks one
// ---------------------------------------------------------------------------

interface PagingState {
  page: number;
  setPage: (v: number) => void;
  pageSize: number;
  setPageSize: (v: number) => void;
  searchTerm: string;
  setSearchTerm: (v: string) => void;
}

/**
 * Manages page / pageSize / searchTerm state, optionally synced to the URL.
 * Always calls both hooks to comply with React rules of hooks.
 */
function usePagingState(
  syncPagingParamsWithURL: boolean,
  initialPage: number,
  initialPageSize: number,
  initialSearchTerm: string,
): PagingState {
  // URL-synced variants
  const [urlPage, setUrlPage] = usePagingTableParams(PagingTableParams.Page, initialPage);
  const [urlPageSize, setUrlPageSize] = usePagingTableParams(
    PagingTableParams.Limit,
    initialPageSize,
  );
  const [urlSearchTerm, setUrlSearchTerm] = useSearchParamState(
    PagingTableParams.Search,
    initialSearchTerm,
  );

  // Local state variants
  const [localPage, setLocalPage] = useState(initialPage);
  const [localPageSize, setLocalPageSize] = useState(initialPageSize);
  const [localSearchTerm, setLocalSearchTerm] = useState(initialSearchTerm);

  return {
    page: syncPagingParamsWithURL ? urlPage : localPage,
    setPage: syncPagingParamsWithURL ? setUrlPage : setLocalPage,
    pageSize: syncPagingParamsWithURL ? urlPageSize : localPageSize,
    setPageSize: syncPagingParamsWithURL ? setUrlPageSize : setLocalPageSize,
    searchTerm: syncPagingParamsWithURL ? urlSearchTerm : localSearchTerm,
    setSearchTerm: syncPagingParamsWithURL ? setUrlSearchTerm : setLocalSearchTerm,
  };
}

// ---------------------------------------------------------------------------
// useModel
// ---------------------------------------------------------------------------

/**
 * Generic CRUD hook for interacting with a backend model API.
 * Provides pagination, filtering, sorting, and full CRUD operations.
 *
 * @param modelName - API model name / path segment (e.g. "attachment")
 * @param config    - Runtime DI config (backendHost, user, etc.)
 * @param options   - Per-call options (filters, page, etc.)
 */
export function useModel<T = Record<string, unknown>>(
  modelName: string,
  config: UseModelConfig,
  options: UseModelOptions = {},
): UseModelReturn<T> {
  const { backendHost, user, setUser, organizationId, t = (key: string) => key } = config;

  function _buildHeaders(extra: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = { ...extra };
    const orgId =
      organizationId ??
      (typeof window !== 'undefined'
        ? parseInt(localStorage.getItem('organizationId') || '', 10)
        : NaN);
    if (Number.isFinite(orgId)) {
      headers['X-Organization-Id'] = String(orgId);
    }
    return headers;
  }

  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;

  const {
    id = null,
    autoFetch = false,
    syncPagingParamsWithURL = false,
    searchFields = [],
    page: initialPage = 1,
    pageSize: initialPageSize = 20,
    filters: initialFilters = [],
    orderBy: initialOrderBy = { field: 'id', direction: 'desc' },
    redirectLoginIfUnauthorized = true,
    abortPreviousRequest = true,
    filterAfterLoad = null,
  } = options;

  const [data, setData] = useState<T[]>([]);
  const [originalData, setOriginalData] = useState<T[]>([]);
  const [record, setRecord] = useState<T | null>(null);
  const [loading, setLoading] = useState(autoFetch);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  const { page, setPage, searchTerm, setSearchTerm } = usePagingState(
    syncPagingParamsWithURL,
    initialPage,
    initialPageSize ?? 20,
    '',
  );

  // When syncPagingParamsWithURL is false, use local state for filters/orderBy
  // When true, sync with URL (always call both, select one)
  const [urlFilters, setUrlFilters] = useSearchParamState<FilterCondition[]>(
    'filters',
    initialFilters,
  );
  const [localFilters, setLocalFilters] = useState<FilterCondition[]>(initialFilters);
  const filters = syncPagingParamsWithURL ? urlFilters : localFilters;
  const setFilters = syncPagingParamsWithURL ? setUrlFilters : setLocalFilters;

  const [urlOrderBy, setUrlOrderBy] = useSearchParamState<OrderBy>('orderBy', initialOrderBy);
  const [localOrderBy, setLocalOrderBy] = useState<OrderBy>(initialOrderBy);
  const orderBy = syncPagingParamsWithURL ? urlOrderBy : localOrderBy;
  const setOrderBy = syncPagingParamsWithURL ? setUrlOrderBy : setLocalOrderBy;

  const abortControllerRef = useRef<AbortController | null>(null);

  // pageSize can be null (fetch all) — keep it separate from paging state
  const [pageSizeOverride, setPageSizeOverride] = useState<number | null>(
    initialPageSize !== undefined ? initialPageSize : 20,
  );

  /**
   * Applies client-side filter function to raw data from the API
   */
  const applyClientSideFilter = useCallback(
    (rawData: T[]): T[] => {
      if (!filterAfterLoad || typeof filterAfterLoad !== 'function') return rawData;
      return rawData.filter(filterAfterLoad);
    },
    [filterAfterLoad],
  );

  // Re-filter when originalData or filterAfterLoad changes
  useEffect(() => {
    if (originalData.length > 0) {
      const filteredData = applyClientSideFilter(originalData);
      setData(filteredData);
      if (filterAfterLoad) setTotal(filteredData.length);
    }
  }, [originalData, applyClientSideFilter, filterAfterLoad]);

  // Auto-fetch
  useEffect(() => {
    if (autoFetch) {
      if (id) void getOne(id);
      else void get();
    }
  }, [autoFetch, page, pageSizeOverride, id, searchTerm, orderBy, filters]);

  // ---------------------------------------------------------------------------
  // Auth helpers
  // ---------------------------------------------------------------------------

  /**
   * Clears stored auth and redirects to login on 401
   */
  async function resetAuth(): Promise<void> {
    setUser(null);
    if (redirectLoginIfUnauthorized) {
      console.error('useModel.resetAuth redirect to login');
      void navigate(`/login?redirect=${currentPath}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Query builder
  // ---------------------------------------------------------------------------

  function _buildQueryBody() {
    const newQuery: Record<string, unknown> = {
      order_by: orderBy || undefined,
      search: {
        AND: filters,
        OR: [],
      },
    };

    if (searchTerm === '') return newQuery;

    (newQuery.search as { OR: FilterCondition[] }).OR = searchFields.map((field) => ({
      field,
      operator: 'ilike',
      value: searchTerm,
    }));

    return newQuery;
  }

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  /**
   * Fetches a paginated list of records
   */
  async function get(queryObject: Record<string, unknown> | null = null) {
    try {
      if (abortControllerRef.current && abortPreviousRequest) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      setLoading(true);
      const skip = (page - 1) * (pageSizeOverride || 0);

      let endpoint = `${backendHost}/${modelName}/search?skip=${skip}`;
      if (pageSizeOverride !== null) {
        endpoint += `&limit=${pageSizeOverride}`;
      }

      const query = queryObject || _buildQueryBody();

      const response = await fetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(query),
        headers: _buildHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        signal: abortControllerRef.current.signal,
      });

      if (response.status === 401) {
        await resetAuth();
        return;
      }
      if (response.status !== 200) {
        const { detail } = (await response.json()) as { detail: unknown };
        const message = formatErrorDetail(detail);
        setError(message);
        throw new Error(message);
      }

      const responseData = (await response.json()) as { data: T[]; total: number };
      setOriginalData(responseData.data);

      const filteredData = applyClientSideFilter(responseData.data);
      setData(filteredData);
      setTotal(filterAfterLoad ? filteredData.length : responseData.total);
      setError(null);

      return {
        ...responseData,
        data: filteredData,
        total: filterAfterLoad ? filteredData.length : responseData.total,
      };
    } catch (err) {
      if ((err as Error).name !== 'AbortError') throw err;
    } finally {
      setLoading(false);
    }
  }

  /**
   * Fetches a single record by ID
   */
  async function getOne(recordId: string | number) {
    try {
      if (abortControllerRef.current && abortPreviousRequest) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      setLoading(true);
      const endpoint = `${backendHost}/${modelName}/${recordId}`;

      const response = await fetch(endpoint, {
        headers: _buildHeaders(),
        credentials: 'include',
        signal: abortControllerRef.current.signal,
      });

      if (response.status === 401) {
        await resetAuth();
        return;
      }
      if (response.status !== 200) {
        const { detail } = (await response.json()) as { detail: unknown };
        const message = formatErrorDetail(detail);
        setError(message);
        throw new Error(message);
      }

      const recordData = (await response.json()) as Record<string, unknown>;

      // Convert naïve ISO datetime strings to Date objects
      for (const key in recordData) {
        if (isISODateString(recordData[key])) {
          recordData[key] = dayjs.utc(recordData[key]).toDate();
        }
      }

      setRecord(recordData as T);
      setError(null);
      return recordData as T;
    } catch (err) {
      if ((err as Error).name !== 'AbortError') throw err;
    } finally {
      setLoading(false);
    }
  }

  /**
   * Exports records to CSV
   */
  async function exportCSV(selectedRows: Array<{ id: string | number }> | null = null) {
    try {
      setLoading(true);
      const endpoint = `${backendHost}/${modelName}/export`;

      let query = _buildQueryBody();
      if (selectedRows != null) {
        query = {
          order_by: orderBy,
          search: {
            AND: [{ field: 'id', operator: 'in', value: selectedRows.map((obj) => obj.id) }],
            OR: [],
          },
        };
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(query),
        headers: _buildHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
      });

      if (response.status === 401) {
        await resetAuth();
        return;
      }
      if (response.status !== 200) {
        const { detail } = (await response.json()) as { detail: unknown };
        const message = formatErrorDetail(detail);
        setError(message);
        throw new Error(message);
      }

      setError(null);
      return response.blob();
    } finally {
      setLoading(false);
    }
  }

  /**
   * Imports records from a CSV file
   */
  async function importCSV(file: File) {
    try {
      setLoading(true);
      const formData = new FormData();
      formData.append('file', file);

      const endpoint = `${backendHost}/${modelName}/import`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: _buildHeaders(),
        credentials: 'include',
        body: formData,
      });

      if (res.status !== 200) {
        const { detail } = (await res.json()) as { detail: unknown };
        const message = formatErrorDetail(detail);
        setError(message);
        throw new Error(message);
      }

      return res.json();
    } finally {
      setLoading(false);
    }
  }

  /**
   * Creates a new record
   */
  async function create(newItem: Partial<T>) {
    setLoading(true);
    const newItemCopy = { ...newItem } as Record<string, unknown>;

    // Convert Date objects to naïve ISO strings
    for (const key of Object.keys(newItemCopy)) {
      if (newItemCopy[key] instanceof Date) {
        newItemCopy[key] = dayjs(newItemCopy[key]).format('YYYY-MM-DDTHH:mm:ss');
      }
    }

    try {
      const endpoint = `${backendHost}/${modelName}`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: _buildHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify(newItemCopy),
      });

      if (response.status === 401) {
        await resetAuth();
        return;
      }
      if (response.status !== 200) {
        const { detail } = (await response.json()) as { detail: unknown };
        const message = formatErrorDetail(detail);
        console.error(message);
        setError(message);
        throw new Error(message);
      }

      const createdItem = (await response.json()) as T;
      const newOriginalData = [...originalData, createdItem];
      setOriginalData(newOriginalData);
      setData(applyClientSideFilter(newOriginalData));
      setError(null);
      return createdItem;
    } finally {
      setLoading(false);
    }
  }

  /**
   * Updates an existing record
   */
  async function update(updatedItem: Partial<T> & { id: string | number }) {
    try {
      setLoading(true);
      const updatedItemCopy = { ...updatedItem } as Record<string, unknown>;

      // Convert Date objects to naïve ISO strings
      for (const key of Object.keys(updatedItemCopy)) {
        if (updatedItemCopy[key] instanceof Date) {
          updatedItemCopy[key] = dayjs(updatedItemCopy[key]).format('YYYY-MM-DDTHH:mm:ss');
        }
      }

      const endpoint = `${backendHost}/${modelName}/${updatedItem.id}`;

      const response = await fetch(endpoint, {
        method: 'PUT',
        headers: _buildHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify(updatedItemCopy),
      });

      if (response.status === 401) {
        await resetAuth();
        return;
      }
      if (response.status !== 200) {
        const { detail } = (await response.json()) as { detail: unknown };
        const message = formatErrorDetail(detail);
        setError(message);
        throw new Error(message);
      }

      const updatedOriginalData = originalData.map((item) =>
        (item as Record<string, unknown>).id === updatedItem.id ? updatedItem : item,
      ) as T[];
      setOriginalData(updatedOriginalData);
      setData(applyClientSideFilter(updatedOriginalData));

      const updatedRecord = { ...updatedItem, ...((await response.json()) as object) } as T;
      setRecord(updatedRecord);
      setError(null);
      return updatedRecord;
    } finally {
      setLoading(false);
    }
  }

  /**
   * Deletes a single record by ID
   */
  async function del(recordId: string | number, force = false) {
    try {
      setLoading(true);
      let endpoint = `${backendHost}/${modelName}/${recordId}`;
      if (force) endpoint += '?force=true';

      const response = await fetch(endpoint, {
        method: 'DELETE',
        headers: _buildHeaders(),
        credentials: 'include',
      });

      if (response.status === 401) {
        await resetAuth();
        return;
      }
      if (response.status !== 200) {
        const { detail } = (await response.json()) as { detail: unknown };
        const message = formatErrorDetail(detail);
        setError(message);
        throw new Error(message);
      }

      const updatedOriginalData = originalData.filter(
        (item) => (item as Record<string, unknown>).id !== recordId,
      );
      setOriginalData(updatedOriginalData);
      setData(applyClientSideFilter(updatedOriginalData));
      setError(null);
    } finally {
      setLoading(false);
    }
  }

  /**
   * Bulk deletes records matching a query object.
   * WARNING: an empty queryObject will delete ALL records of this model.
   */
  async function bulkDelete(queryObject: Record<string, unknown> = {}, force = false) {
    try {
      setLoading(true);
      const endpoint = `${backendHost}/${modelName}/bulk_delete${force ? '?force=true' : ''}`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: _buildHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify(queryObject),
      });

      if (response.status === 401) {
        await resetAuth();
        return;
      }
      if (response.status !== 200) {
        const { detail } = (await response.json()) as { detail: unknown };
        const message = formatErrorDetail(detail);
        setError(message);
        throw new Error(message);
      }

      const deletedIds = extractDeletedIds(queryObject);
      if (deletedIds) {
        const idSet = new Set<string | number>(deletedIds);
        const updatedOriginalData = originalData.filter(
          (item) => !idSet.has((item as Record<string, unknown>).id as string | number),
        );
        setOriginalData(updatedOriginalData);
        setData(applyClientSideFilter(updatedOriginalData));
      } else {
        await get();
      }

      setError(null);
    } finally {
      setLoading(false);
    }
  }

  /**
   * Executes a confirmed bulk-delete after the confirm modal is accepted
   */
  async function handleDeleteConfirm(
    recordIds: Array<string | number>,
    callback: (() => void) | null = null,
    onErr: ((e: unknown) => void) | null = null,
  ) {
    try {
      if (!recordIds.length) return;
      setLoading(true);

      await bulkDelete(
        {
          OR: recordIds.map((recordId) => ({
            field: 'id',
            operator: '=',
            value: recordId,
          })),
        },
        true,
      );

      modals.closeAll();
      if (callback) callback();
    } catch (e) {
      if (onErr) return onErr(e);
      throw e;
    } finally {
      setLoading(false);
    }
  }

  /**
   * Opens a Mantine confirmation modal before deleting records.
   * Checks for cascade effects via the delete-check endpoint first.
   */
  async function deleteWithConfirm(
    recordIds: Array<string | number>,
    callback: (() => void) | null = null,
    onErr: ((e: unknown) => void) | null = null,
  ) {
    setLoading(true);
    const res = await fetch(
      `${backendHost}/util/delete_check/${modelName}/${recordIds.join(',')}`,
      { headers: _buildHeaders(), credentials: 'include' },
    );
    const response = (await res.json()) as {
      to_delete?: Record<string, string[]>;
      to_set_null?: Record<string, string[]>;
    };

    const toDelete = response.to_delete || {};
    const toSetNull = response.to_set_null || {};

    setLoading(false);

    modals.openConfirmModal({
      zIndex: 20000,
      title: React.createElement('span', { className: 'text-2xl font-bold' }, t('Delete')),
      centered: true,
      labels: { confirm: t('Delete'), cancel: t('Cancel') },
      onConfirm: () => {
        void handleDeleteConfirm(recordIds, callback, onErr);
      },
      children: React.createElement(
        'div',
        null,
        React.createElement(
          'div',
          { className: 'mb-2' },
          t(
            recordIds.length > 1
              ? 'Are you sure you want to delete these records?'
              : 'Are you sure you want to delete this record?',
          ),
        ),
        Object.keys(toDelete).length > 0 || Object.keys(toSetNull).length > 0
          ? React.createElement(
              Alert,
              {
                color: 'red',
                title: React.createElement(H2, null, t('WARNING')),
                className: 'mb-2',
              },
              React.createElement(
                'div',
                null,
                React.createElement(
                  'div',
                  null,
                  t('Deleting this record will have the following cascading effects:'),
                ),
                ...Object.keys(toDelete).map((tableName) =>
                  React.createElement(
                    'div',
                    { key: tableName },
                    React.createElement(
                      'div',
                      { className: 'font-semibold' },
                      t('Deleting from '),
                      tableName,
                      ':',
                    ),
                    ...toDelete[tableName].map((rec) =>
                      React.createElement('div', { key: rec }, rec),
                    ),
                  ),
                ),
                ...Object.keys(toSetNull).map((tableName) =>
                  React.createElement(
                    'div',
                    { key: tableName },
                    React.createElement(
                      'div',
                      { className: 'font-semibold' },
                      t('Setting empty reference in '),
                      tableName,
                      ':',
                    ),
                    ...toSetNull[tableName].map((rec) =>
                      React.createElement('div', { key: rec }, rec),
                    ),
                  ),
                ),
              ),
            )
          : null,
      ),
    });
  }

  /**
   * Uploads a file and optionally links it to a record via an attachment ID field
   */
  async function uploadFile(file: File, attachmentIdField: string, rcd: T | null = record) {
    try {
      setLoading(true);
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${backendHost}/attachment/`, {
        method: 'POST',
        headers: _buildHeaders(),
        credentials: 'include',
        body: formData,
      });

      if (res.status !== 200) {
        const { detail } = (await res.json()) as { detail: unknown };
        const message = formatErrorDetail(detail);
        setError(message);
        throw new Error(message);
      }

      const resp = (await res.json()) as { id: string | number };

      if (rcd) {
        const copyRecord = { ...rcd } as Record<string, unknown>;
        copyRecord[attachmentIdField] = resp.id;
        await update(copyRecord as Partial<T> & { id: string | number });
      }

      return resp;
    } finally {
      setLoading(false);
    }
  }

  return {
    modelName,
    data,
    setData,
    originalData,
    setOriginalData,
    record,
    setRecord,
    loading,
    error,
    get,
    getOne,
    create,
    update,
    del,
    bulkDelete,
    deleteWithConfirm,
    exportCSV,
    importCSV,
    uploadFile,
    page,
    setPage,
    pageSize: pageSizeOverride,
    setPageSize: setPageSizeOverride,
    total,
    filters,
    setFilters,
    searchTerm,
    setSearchTerm,
    orderBy,
    setOrderBy,
  };
}
