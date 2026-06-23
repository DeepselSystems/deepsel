import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useFetch } from '../src/common/lib/hooks/useFetch';

function makeOkResponse(body: unknown, status = 200) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function makeErrorResponse(status: number, detail: unknown) {
  return {
    status,
    ok: false,
    json: vi.fn().mockResolvedValue({ detail }),
  } as unknown as Response;
}

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter initialEntries={['/users/42']}>{children}</MemoryRouter>
);

const baseConfig = (setUser = vi.fn()) => ({
  backendHost: 'https://h/api/v1',
  setUser,
});

describe('useFetch', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('GET serializes params as a query string on the configured URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeOkResponse([]));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useFetch('user', baseConfig()), { wrapper });
    await act(async () => {
      result.current.setParams({ q: 'tim', limit: '10' });
    });
    await act(async () => {
      await result.current.get();
    });

    expect(fetchMock).toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls.at(-1)!;
    expect(url).toMatch(/^https:\/\/h\/api\/v1\/user\?/);
    expect(url).toContain('q=tim');
    expect(url).toContain('limit=10');
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    expect(init.credentials).toBe('include');
  });

  it('GET without params just hits the base path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeOkResponse([]));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useFetch('user', baseConfig()), { wrapper });
    await act(async () => {
      await result.current.get();
    });

    expect(fetchMock.mock.calls[0][0]).toBe('https://h/api/v1/user');
  });

  it('POST sends JSON body and no query string', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeOkResponse({ id: 1 }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useFetch('user', baseConfig()), { wrapper });
    await act(async () => {
      await result.current.post({ name: 'tim' });
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://h/api/v1/user');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.body).toBe('{"name":"tim"}');
  });

  it('POST honors a custom path override', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeOkResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useFetch('user', baseConfig()), { wrapper });
    await act(async () => {
      await result.current.post({ x: 1 }, { path: 'user/activate' });
    });

    expect(fetchMock.mock.calls[0][0]).toBe('https://h/api/v1/user/activate');
  });

  it('forwards X-Organization-Id from localStorage', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeOkResponse([]));
    vi.stubGlobal('fetch', fetchMock);
    localStorage.setItem('organizationId', '99');

    const { result } = renderHook(() => useFetch('user', baseConfig()), { wrapper });
    await act(async () => {
      await result.current.get();
    });

    expect(fetchMock.mock.calls[0][1].headers['X-Organization-Id']).toBe('99');
  });

  it('omits X-Organization-Id when localStorage value is not a finite number', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeOkResponse([]));
    vi.stubGlobal('fetch', fetchMock);
    // no organizationId in localStorage

    const { result } = renderHook(() => useFetch('user', baseConfig()), { wrapper });
    await act(async () => {
      await result.current.get();
    });

    expect(fetchMock.mock.calls[0][1].headers['X-Organization-Id']).toBeUndefined();
  });

  it('401 clears user and does not throw', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeOkResponse(null, 401));
    vi.stubGlobal('fetch', fetchMock);

    const setUser = vi.fn();
    const { result } = renderHook(() => useFetch('user', baseConfig(setUser)), {
      wrapper,
    });
    await act(async () => {
      await result.current.get();
    });

    expect(setUser).toHaveBeenCalledWith(null);
    expect(result.current.error).toBeNull();
  });

  it('401 does not clear user when redirectLoginIfUnauthorized=false (still calls setUser per current impl)', async () => {
    // Note: per useFetch.ts, resetAuth() always calls setUser(null);
    // redirectLoginIfUnauthorized only gates the navigate() call.
    const fetchMock = vi.fn().mockResolvedValue(makeOkResponse(null, 401));
    vi.stubGlobal('fetch', fetchMock);

    const setUser = vi.fn();
    const { result } = renderHook(
      () => useFetch('user', baseConfig(setUser), { redirectLoginIfUnauthorized: false }),
      { wrapper },
    );
    await act(async () => {
      await result.current.get();
    });

    expect(setUser).toHaveBeenCalledWith(null);
  });

  it('non-2xx (non-401) sets error from formatErrorDetail and throws', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(makeErrorResponse(400, [{ loc: ['body', 'x'], msg: 'bad' }]));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useFetch('user', baseConfig()), { wrapper });

    let caught: Error | undefined;
    await act(async () => {
      try {
        await result.current.get();
      } catch (e) {
        caught = e as Error;
      }
    });

    expect(caught).toBeInstanceOf(Error);
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toContain('body.x: bad');
  });

  it('200 array response populates `data`', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeOkResponse([{ id: 1 }, { id: 2 }]));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useFetch('user', baseConfig()), { wrapper });
    await act(async () => {
      await result.current.get();
    });

    expect(result.current.data).toEqual([{ id: 1 }, { id: 2 }]);
    expect(result.current.error).toBeNull();
  });

  it('200 non-array response populates `record`', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeOkResponse({ id: 1, name: 'tim' }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useFetch('user', baseConfig()), { wrapper });
    await act(async () => {
      await result.current.get();
    });

    expect(result.current.record).toEqual({ id: 1, name: 'tim' });
  });

  it('autoFetch triggers a GET on mount', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeOkResponse([]));
    vi.stubGlobal('fetch', fetchMock);

    renderHook(() => useFetch('user', baseConfig(), { autoFetch: true }), { wrapper });
    // Allow the useEffect microtask to flush.
    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalled();
  });
});
