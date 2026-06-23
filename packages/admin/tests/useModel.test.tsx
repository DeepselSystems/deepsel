import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Capture calls to Mantine's openConfirmModal so tests can drive the
// confirmation flow without rendering a real modal.
const openConfirmModalMock = vi.fn();
const closeAllMock = vi.fn();

vi.mock('@mantine/modals', () => ({
  modals: {
    openConfirmModal: (args: unknown) => openConfirmModalMock(args),
    closeAll: () => closeAllMock(),
  },
}));

import { useModel } from '../src/common/lib/hooks/useModel';

function makeResponse(status: number, body: unknown) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter initialEntries={['/page']}>{children}</MemoryRouter>
);

const baseConfig = (overrides: Record<string, unknown> = {}) => ({
  backendHost: 'https://h/api/v1',
  user: { id: 1, token: 'tok' } as never,
  setUser: vi.fn(),
  ...overrides,
});

describe('useModel', () => {
  beforeEach(() => {
    openConfirmModalMock.mockReset();
    closeAllMock.mockReset();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('get / _buildQueryBody', () => {
    it('builds a search POST with skip, limit, orderBy and AND filters', async () => {
      const fetchMock = vi.fn().mockResolvedValue(makeResponse(200, { data: [], total: 0 }));
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHook(
        () =>
          useModel('attachment', baseConfig(), {
            page: 2,
            pageSize: 25,
            filters: [{ field: 'owner_id', operator: '=', value: 1 }],
            orderBy: { field: 'name', direction: 'asc' },
          }),
        { wrapper },
      );
      await act(async () => {
        await result.current.get();
      });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://h/api/v1/attachment/search?skip=25&limit=25');
      expect(init.method).toBe('POST');
      const body = JSON.parse(init.body);
      expect(body).toEqual({
        order_by: { field: 'name', direction: 'asc' },
        search: {
          AND: [{ field: 'owner_id', operator: '=', value: 1 }],
          OR: [],
        },
      });
    });

    it('omits &limit when pageSize is null (fetch all)', async () => {
      const fetchMock = vi.fn().mockResolvedValue(makeResponse(200, { data: [], total: 0 }));
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHook(
        () => useModel('attachment', baseConfig(), { pageSize: null }),
        { wrapper },
      );
      await act(async () => {
        await result.current.get();
      });

      const url = fetchMock.mock.calls[0][0];
      expect(url).toBe('https://h/api/v1/attachment/search?skip=0');
    });

    it('a search term populates OR-ilike clauses for every searchField', async () => {
      const fetchMock = vi.fn().mockResolvedValue(makeResponse(200, { data: [], total: 0 }));
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHook(
        () =>
          useModel('user', baseConfig(), {
            searchFields: ['email', 'name'],
          }),
        { wrapper },
      );

      act(() => {
        result.current.setSearchTerm('tim');
      });
      await act(async () => {
        await result.current.get();
      });

      const body = JSON.parse(fetchMock.mock.calls.at(-1)![1].body);
      expect(body.search.OR).toEqual([
        { field: 'email', operator: 'ilike', value: 'tim' },
        { field: 'name', operator: 'ilike', value: 'tim' },
      ]);
    });

    it('forwards X-Organization-Id from config prop, then localStorage', async () => {
      const fetchMock = vi.fn().mockResolvedValue(makeResponse(200, { data: [], total: 0 }));
      vi.stubGlobal('fetch', fetchMock);

      // prop wins
      {
        const { result } = renderHook(() => useModel('user', baseConfig({ organizationId: 7 })), {
          wrapper,
        });
        await act(async () => {
          await result.current.get();
        });
        expect(fetchMock.mock.calls.at(-1)![1].headers['X-Organization-Id']).toBe('7');
      }

      fetchMock.mockClear();

      // localStorage fallback
      {
        localStorage.setItem('organizationId', '13');
        const { result } = renderHook(() => useModel('user', baseConfig()), { wrapper });
        await act(async () => {
          await result.current.get();
        });
        expect(fetchMock.mock.calls.at(-1)![1].headers['X-Organization-Id']).toBe('13');
      }
    });

    it('200 populates data and total', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(makeResponse(200, { data: [{ id: 1 }, { id: 2 }], total: 99 }));
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHook(() => useModel('user', baseConfig()), { wrapper });
      await act(async () => {
        await result.current.get();
      });

      expect(result.current.data).toEqual([{ id: 1 }, { id: 2 }]);
      expect(result.current.originalData).toEqual([{ id: 1 }, { id: 2 }]);
      expect(result.current.total).toBe(99);
    });

    it('401 clears user and returns without setting error', async () => {
      const fetchMock = vi.fn().mockResolvedValue(makeResponse(401, null));
      vi.stubGlobal('fetch', fetchMock);

      const setUser = vi.fn();
      const { result } = renderHook(() => useModel('user', baseConfig({ setUser })), {
        wrapper,
      });
      await act(async () => {
        await result.current.get();
      });

      expect(setUser).toHaveBeenCalledWith(null);
      expect(result.current.error).toBeNull();
    });

    it('non-2xx sets error via formatErrorDetail and throws', async () => {
      const fetchMock = vi.fn().mockResolvedValue(makeResponse(500, { detail: 'database down' }));
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHook(() => useModel('user', baseConfig()), { wrapper });
      let caught: Error | undefined;
      await act(async () => {
        try {
          await result.current.get();
        } catch (e) {
          caught = e as Error;
        }
      });
      expect(caught?.message).toBe('database down');
      expect(result.current.error).toBe('database down');
    });
  });

  describe('getOne', () => {
    it('GETs by id with X-Organization-Id and credentials include', async () => {
      const fetchMock = vi.fn().mockResolvedValue(makeResponse(200, { id: 5, name: 'tim' }));
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHook(() => useModel('user', baseConfig({ organizationId: 1 })), {
        wrapper,
      });
      await act(async () => {
        await result.current.getOne(5);
      });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://h/api/v1/user/5');
      expect(init.credentials).toBe('include');
      expect(init.headers['X-Organization-Id']).toBe('1');
      expect(result.current.record).toMatchObject({ id: 5, name: 'tim' });
    });
  });

  describe('create / update / del', () => {
    it('create POSTs to the model endpoint and appends to originalData', async () => {
      const fetchMock = vi.fn().mockResolvedValue(makeResponse(200, { id: 3, name: 'new' }));
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHook(() => useModel('user', baseConfig()), { wrapper });
      let returned: unknown;
      await act(async () => {
        returned = await result.current.create({ name: 'new' });
      });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://h/api/v1/user');
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body)).toEqual({ name: 'new' });
      expect(returned).toEqual({ id: 3, name: 'new' });
      expect(result.current.originalData).toEqual([{ id: 3, name: 'new' }]);
    });

    it('update PUTs to /:id and replaces the record in originalData', async () => {
      const fetchMock = vi
        .fn()
        // initial fetch
        .mockResolvedValueOnce(makeResponse(200, { data: [{ id: 1, name: 'old' }], total: 1 }))
        // update
        .mockResolvedValueOnce(makeResponse(200, { name: 'new' }));
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHook(() => useModel('user', baseConfig()), { wrapper });
      await act(async () => {
        await result.current.get();
      });
      await act(async () => {
        await result.current.update({ id: 1, name: 'new' });
      });

      const [url, init] = fetchMock.mock.calls[1];
      expect(url).toBe('https://h/api/v1/user/1');
      expect(init.method).toBe('PUT');
      expect(JSON.parse(init.body)).toEqual({ id: 1, name: 'new' });
      expect(result.current.originalData).toEqual([{ id: 1, name: 'new' }]);
    });

    it('del DELETEs /:id and removes the record from originalData', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(makeResponse(200, { data: [{ id: 1 }, { id: 2 }], total: 2 }))
        .mockResolvedValueOnce(makeResponse(200, {}));
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHook(() => useModel('user', baseConfig()), { wrapper });
      await act(async () => {
        await result.current.get();
      });
      await act(async () => {
        await result.current.del(1);
      });

      const [url, init] = fetchMock.mock.calls[1];
      expect(url).toBe('https://h/api/v1/user/1');
      expect(init.method).toBe('DELETE');
      expect(result.current.originalData).toEqual([{ id: 2 }]);
    });

    it('del with force=true appends ?force=true', async () => {
      const fetchMock = vi.fn().mockResolvedValue(makeResponse(200, {}));
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHook(() => useModel('user', baseConfig()), { wrapper });
      await act(async () => {
        await result.current.del(1, true);
      });

      expect(fetchMock.mock.calls[0][0]).toBe('https://h/api/v1/user/1?force=true');
    });
  });

  describe('bulkDelete', () => {
    it('on success with extractable ids, filters originalData in-place (no refetch)', async () => {
      const fetchMock = vi
        .fn()
        // initial list
        .mockResolvedValueOnce(
          makeResponse(200, { data: [{ id: 1 }, { id: 2 }, { id: 3 }], total: 3 }),
        )
        // bulk_delete
        .mockResolvedValueOnce(makeResponse(200, {}));
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHook(() => useModel('user', baseConfig()), { wrapper });
      await act(async () => {
        await result.current.get();
      });
      await act(async () => {
        await result.current.bulkDelete({
          OR: [
            { field: 'id', operator: '=', value: 1 },
            { field: 'id', operator: '=', value: 3 },
          ],
        });
      });

      // Exactly 2 fetch calls: initial list + bulk_delete (no refetch after).
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const [url, init] = fetchMock.mock.calls[1];
      expect(url).toBe('https://h/api/v1/user/bulk_delete');
      expect(init.method).toBe('POST');
      expect(result.current.originalData).toEqual([{ id: 2 }]);
    });

    it('refetches when extractDeletedIds returns nothing usable', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(makeResponse(200, { data: [{ id: 1 }], total: 1 }))
        // bulk_delete (with an unrecognised query shape)
        .mockResolvedValueOnce(makeResponse(200, {}))
        // refetch
        .mockResolvedValueOnce(makeResponse(200, { data: [], total: 0 }));
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHook(() => useModel('user', baseConfig()), { wrapper });
      await act(async () => {
        await result.current.get();
      });
      await act(async () => {
        await result.current.bulkDelete({ AND: [{ field: 'active', operator: '=', value: true }] });
      });

      // 3 calls: initial list, bulk_delete, refetch
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(fetchMock.mock.calls[2][0]).toBe('https://h/api/v1/user/search?skip=0&limit=20');
      expect(result.current.originalData).toEqual([]);
    });

    it('bulk_delete with force=true appends ?force=true', async () => {
      const fetchMock = vi.fn().mockResolvedValue(makeResponse(200, {}));
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHook(() => useModel('user', baseConfig()), { wrapper });
      await act(async () => {
        await result.current.bulkDelete({ OR: [{ field: 'id', operator: '=', value: 1 }] }, true);
      });

      expect(fetchMock.mock.calls[0][0]).toBe('https://h/api/v1/user/bulk_delete?force=true');
    });

    it('error path leaves originalData unchanged and sets error', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(makeResponse(200, { data: [{ id: 1 }, { id: 2 }], total: 2 }))
        .mockResolvedValueOnce(makeResponse(409, { detail: 'has references' }));
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHook(() => useModel('user', baseConfig()), { wrapper });
      await act(async () => {
        await result.current.get();
      });
      let caught: Error | undefined;
      await act(async () => {
        try {
          await result.current.bulkDelete({
            OR: [{ field: 'id', operator: '=', value: 1 }],
          });
        } catch (e) {
          caught = e as Error;
        }
      });
      expect(caught?.message).toBe('has references');

      expect(result.current.error).toBe('has references');
      expect(result.current.originalData).toEqual([{ id: 1 }, { id: 2 }]);
    });
  });

  describe('export/import & misc paths', () => {
    it('exportCSV POSTs to /:model/export with the query body and returns a Blob', async () => {
      const fakeBlob = new Blob(['id,name\n1,a'], { type: 'text/csv' });
      const fetchMock = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        blob: vi.fn().mockResolvedValue(fakeBlob),
      } as unknown as Response);
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHook(
        () =>
          useModel('user', baseConfig(), {
            filters: [{ field: 'active', operator: '=', value: true }],
            orderBy: { field: 'id', direction: 'asc' },
          }),
        { wrapper },
      );

      let returned: Blob | undefined;
      await act(async () => {
        returned = await result.current.exportCSV();
      });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://h/api/v1/user/export');
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body)).toEqual({
        order_by: { field: 'id', direction: 'asc' },
        search: {
          AND: [{ field: 'active', operator: '=', value: true }],
          OR: [],
        },
      });
      expect(returned).toBe(fakeBlob);
    });

    it('exportCSV with selectedRows builds an id-in AND query', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        blob: vi.fn().mockResolvedValue(new Blob()),
      } as unknown as Response);
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHook(() => useModel('user', baseConfig()), { wrapper });
      await act(async () => {
        await result.current.exportCSV([{ id: 1 }, { id: 7 }]);
      });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.search).toEqual({
        AND: [{ field: 'id', operator: 'in', value: [1, 7] }],
        OR: [],
      });
    });

    it('exportCSV 401 calls setUser(null) and returns undefined (no Blob)', async () => {
      const fetchMock = vi.fn().mockResolvedValue(makeResponse(401, null));
      vi.stubGlobal('fetch', fetchMock);

      const setUser = vi.fn();
      const { result } = renderHook(() => useModel('user', baseConfig({ setUser })), {
        wrapper,
      });

      let returned: Blob | undefined;
      await act(async () => {
        returned = await result.current.exportCSV();
      });

      expect(setUser).toHaveBeenCalledWith(null);
      expect(returned).toBeUndefined();
    });

    it('importCSV POSTs FormData with the file and returns parsed JSON', async () => {
      const fetchMock = vi.fn().mockResolvedValue(makeResponse(200, { created: 3 }));
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHook(() => useModel('user', baseConfig()), { wrapper });
      const file = new File(['id,name\n1,a'], 'data.csv', { type: 'text/csv' });
      let returned: unknown;
      await act(async () => {
        returned = await result.current.importCSV(file);
      });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://h/api/v1/user/import');
      expect(init.method).toBe('POST');
      expect(init.body).toBeInstanceOf(FormData);
      const fd = init.body as FormData;
      expect(fd.get('file')).toBe(file);
      expect(returned).toEqual({ created: 3 });
    });

    it('importCSV does NOT auto-reset auth on 401 — it throws like any non-200', async () => {
      // Note: intentional inconsistency with other endpoints (get/update/del/exportCSV).
      // If this changes, update this test along with the call site.
      const fetchMock = vi.fn().mockResolvedValue(makeResponse(401, { detail: 'unauth' }));
      vi.stubGlobal('fetch', fetchMock);

      const setUser = vi.fn();
      const { result } = renderHook(() => useModel('user', baseConfig({ setUser })), {
        wrapper,
      });

      const file = new File([''], 'x.csv', { type: 'text/csv' });
      let caught: Error | undefined;
      await act(async () => {
        try {
          await result.current.importCSV(file);
        } catch (e) {
          caught = e as Error;
        }
      });

      expect(caught?.message).toBe('unauth');
      expect(setUser).not.toHaveBeenCalled();
    });

    it('create serializes Date fields to naïve YYYY-MM-DDTHH:mm:ss strings', async () => {
      const fetchMock = vi.fn().mockResolvedValue(makeResponse(200, { id: 1 }));
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHook(() => useModel('user', baseConfig()), { wrapper });
      // Build a date in local time so we can match against the dayjs (non-UTC) formatter.
      const d = new Date(2026, 4, 22, 10, 30, 0); // 2026-05-22 10:30:00 local
      await act(async () => {
        await result.current.create({ scheduled_at: d } as never);
      });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.scheduled_at).toBe('2026-05-22T10:30:00');
      expect(body.scheduled_at).not.toMatch(/Z$/);
    });

    it('getOne parses naïve ISO date strings on the response into Date objects', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(makeResponse(200, { id: 1, created_at: '2026-05-22T10:30:00' }));
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHook(() => useModel('user', baseConfig()), { wrapper });
      let returned: { id: number; created_at: unknown } | undefined;
      await act(async () => {
        returned = (await result.current.getOne(1)) as never;
      });

      expect(returned?.created_at).toBeInstanceOf(Date);
      expect(result.current.record?.created_at).toBeInstanceOf(Date);
    });

    it('filterAfterLoad trims data and total, leaves originalData intact', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        makeResponse(200, {
          data: [
            { id: 1, kind: 'a' },
            { id: 2, kind: 'b' },
            { id: 3, kind: 'a' },
          ],
          total: 3,
        }),
      );
      vi.stubGlobal('fetch', fetchMock);

      // Hoist filterAfterLoad so its identity is stable across renders —
      // otherwise the hook's "re-apply filter when applyClientSideFilter
      // changes" effect would loop forever.
      const filter = (item: unknown) => (item as { kind: string }).kind === 'a';

      const { result } = renderHook(
        () => useModel('user', baseConfig(), { filterAfterLoad: filter }),
        { wrapper },
      );

      await act(async () => {
        await result.current.get();
      });

      expect(result.current.originalData).toHaveLength(3);
      expect(result.current.data).toEqual([
        { id: 1, kind: 'a' },
        { id: 3, kind: 'a' },
      ]);
      expect(result.current.total).toBe(2);
    });

    it('aborts the previous in-flight get() when a new one starts', async () => {
      // First call: a fetch we can reject ourselves once the abort fires.
      let firstInit: RequestInit | undefined;
      let rejectFirst: ((e: Error) => void) | undefined;
      const fetchMock = vi.fn().mockImplementationOnce((_url: string, init: RequestInit) => {
        firstInit = init;
        return new Promise<Response>((_resolve, reject) => {
          rejectFirst = reject;
          init.signal?.addEventListener('abort', () => {
            const e = new Error('aborted');
            e.name = 'AbortError';
            reject(e);
          });
        });
      });
      fetchMock.mockResolvedValueOnce(makeResponse(200, { data: [{ id: 1 }], total: 1 }));
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHook(() => useModel('user', baseConfig()), { wrapper });

      let firstPromise: Promise<unknown> | undefined;
      await act(async () => {
        firstPromise = result.current.get();
      });

      await act(async () => {
        await result.current.get();
      });

      // The first request's signal should now be aborted.
      expect(firstInit?.signal?.aborted).toBe(true);
      // The first promise resolves (the hook swallows AbortError).
      await act(async () => {
        await firstPromise;
      });

      expect(result.current.originalData).toEqual([{ id: 1 }]);
      // Suppress an "unused" lint hint
      void rejectFirst;
    });
  });

  describe('deleteWithConfirm', () => {
    it('fetches the delete-check endpoint and opens a Mantine confirm modal', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(makeResponse(200, { to_delete: {}, to_set_null: {} }));
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHook(() => useModel('user', baseConfig()), { wrapper });
      await act(async () => {
        await result.current.deleteWithConfirm([1, 2]);
      });

      expect(fetchMock.mock.calls[0][0]).toBe('https://h/api/v1/util/delete_check/user/1,2');
      expect(openConfirmModalMock).toHaveBeenCalledTimes(1);
      const args = openConfirmModalMock.mock.calls[0][0] as { onConfirm: () => void };
      expect(typeof args.onConfirm).toBe('function');
    });

    it('confirm triggers bulk_delete with OR-of-ids and force=true, then closes modals', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(makeResponse(200, { to_delete: {}, to_set_null: {} }))
        .mockResolvedValueOnce(makeResponse(200, {}));
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHook(() => useModel('user', baseConfig()), { wrapper });
      await act(async () => {
        await result.current.deleteWithConfirm([1, 2]);
      });

      const args = openConfirmModalMock.mock.calls[0][0] as { onConfirm: () => void };
      await act(async () => {
        args.onConfirm();
        // wait for the internal handleDeleteConfirm to finish
        await new Promise((r) => setTimeout(r, 0));
      });

      // calls[0] = delete_check, calls[1] = bulk_delete?force=true
      expect(fetchMock.mock.calls[1][0]).toBe('https://h/api/v1/user/bulk_delete?force=true');
      const body = JSON.parse(fetchMock.mock.calls[1][1].body);
      expect(body).toEqual({
        OR: [
          { field: 'id', operator: '=', value: 1 },
          { field: 'id', operator: '=', value: 2 },
        ],
      });
      expect(closeAllMock).toHaveBeenCalled();
    });
  });
});
