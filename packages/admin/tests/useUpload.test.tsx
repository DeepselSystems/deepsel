import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useUpload } from '../src/common/lib/hooks/useUpload';

function makeOkResponse(body: unknown) {
  return {
    status: 200,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function makeErrorResponse(status: number, detail: unknown) {
  return {
    status,
    json: vi.fn().mockResolvedValue({ detail }),
  } as unknown as Response;
}

describe('useUpload', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs to `${backendHost}/${api}` with FormData containing all files under "files"', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeOkResponse([{ id: 1, name: 'a.png' }]));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useUpload({ backendHost: 'https://api.example/api/v1', token: 'tok' }),
    );

    const file1 = new File(['a'], 'a.png', { type: 'image/png' });
    const file2 = new File(['b'], 'b.png', { type: 'image/png' });
    await act(async () => {
      await result.current.uploadFileModel('attachment', [file1, file2]);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.example/api/v1/attachment');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    const fd = init.body as FormData;
    expect(fd.getAll('files')).toHaveLength(2);
    expect((fd.getAll('files')[0] as File).name).toBe('a.png');
    expect((fd.getAll('files')[1] as File).name).toBe('b.png');
  });

  it('adds Authorization header only when token is provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeOkResponse([]));
    vi.stubGlobal('fetch', fetchMock);

    // with token
    {
      const { result } = renderHook(() =>
        useUpload({ backendHost: 'https://h/api/v1', token: 'tok-123' }),
      );
      await act(async () => {
        await result.current.uploadFileModel('attachment', []);
      });
      expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer tok-123');
    }

    fetchMock.mockClear();

    // without token
    {
      const { result } = renderHook(() =>
        useUpload({ backendHost: 'https://h/api/v1', token: undefined }),
      );
      await act(async () => {
        await result.current.uploadFileModel('attachment', []);
      });
      expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
    }
  });

  it('uses organizationId prop when supplied', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeOkResponse([]));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() =>
      useUpload({ backendHost: 'https://h/api/v1', token: 't', organizationId: 42 }),
    );
    await act(async () => {
      await result.current.uploadFileModel('attachment', []);
    });
    expect(fetchMock.mock.calls[0][1].headers['X-Organization-Id']).toBe('42');
  });

  it('falls back to localStorage organizationId only when prop is null/undefined', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeOkResponse([]));
    vi.stubGlobal('fetch', fetchMock);
    localStorage.setItem('organizationId', '7');

    const { result } = renderHook(() => useUpload({ backendHost: 'https://h/api/v1', token: 't' }));
    await act(async () => {
      await result.current.uploadFileModel('attachment', []);
    });
    expect(fetchMock.mock.calls[0][1].headers['X-Organization-Id']).toBe('7');
  });

  it('omits X-Organization-Id when neither prop nor localStorage has a finite number', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeOkResponse([]));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useUpload({ backendHost: 'https://h/api/v1', token: 't' }));
    await act(async () => {
      await result.current.uploadFileModel('attachment', []);
    });
    expect(fetchMock.mock.calls[0][1].headers['X-Organization-Id']).toBeUndefined();
  });

  it('non-200 sets error via formatErrorDetail and throws', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(makeErrorResponse(400, [{ loc: ['body', 'files'], msg: 'too large' }]));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useUpload({ backendHost: 'https://h/api/v1', token: 't' }));

    let caught: Error | undefined;
    await act(async () => {
      try {
        await result.current.uploadFileModel('attachment', []);
      } catch (e) {
        caught = e as Error;
      }
    });
    expect(caught?.message).toBe('body.files: too large');
    expect(result.current.error).toBe('body.files: too large');
    expect(result.current.loading).toBe(false);
  });

  it('200 response returns parsed array and clears error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeOkResponse([{ id: 1, name: 'ok.png' }]));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useUpload({ backendHost: 'https://h/api/v1', token: 't' }));
    let returned: unknown;
    await act(async () => {
      returned = await result.current.uploadFileModel('attachment', []);
    });
    expect(returned).toEqual([{ id: 1, name: 'ok.png' }]);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('appends a query string in api path as-is', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeOkResponse([]));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useUpload({ backendHost: 'https://h/api/v1', token: 't' }));
    await act(async () => {
      await result.current.uploadFileModel('attachment?used_for=USER_AVATAR', []);
    });
    expect(fetchMock.mock.calls[0][0]).toBe('https://h/api/v1/attachment?used_for=USER_AVATAR');
  });
});
