import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const getMock = vi.fn();

vi.mock('../src/common/api/useFetch.js', () => ({
  default: () => ({ get: getMock }),
}));

const wrapper = ({ children }) => <MemoryRouter>{children}</MemoryRouter>;

async function loadHook() {
  // Reset module state so the global cache is fresh per test
  vi.resetModules();
  const mod = await import('../src/common/api/useUploadSizeLimit.js');
  return mod.default;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useUploadSizeLimit', () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves the upload size limit from the API and clears loading', async () => {
    getMock.mockResolvedValue({ success: true, filename: '25' });
    const useUploadSizeLimit = await loadHook();

    const { result } = renderHook(() => useUploadSizeLimit(), { wrapper });

    // Wait for the async effect chain
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.uploadSizeLimit).toBe(25);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to default 5 on fetch error and surfaces error', async () => {
    const err = new Error('boom');
    getMock.mockRejectedValue(err);
    // Suppress the hook's console.warn for the error path
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const useUploadSizeLimit = await loadHook();

    const { result } = renderHook(() => useUploadSizeLimit(), { wrapper });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.uploadSizeLimit).toBe(5);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(err);
    warnSpy.mockRestore();
  });

  it('shares the global cache across mounts (no second network call)', async () => {
    getMock.mockResolvedValue({ success: true, filename: '12' });
    const useUploadSizeLimit = await loadHook();

    const first = renderHook(() => useUploadSizeLimit(), { wrapper });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(first.result.current.uploadSizeLimit).toBe(12);
    expect(getMock).toHaveBeenCalledTimes(1);

    const second = renderHook(() => useUploadSizeLimit(), { wrapper });
    await act(async () => {
      await Promise.resolve();
    });

    expect(second.result.current.uploadSizeLimit).toBe(12);
    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it('shares an in-flight promise between concurrent mounts', async () => {
    const d = deferred();
    getMock.mockReturnValue(d.promise);
    const useUploadSizeLimit = await loadHook();

    const a = renderHook(() => useUploadSizeLimit(), { wrapper });
    const b = renderHook(() => useUploadSizeLimit(), { wrapper });

    // Both mounts kicked off before the first promise resolves
    expect(getMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      d.resolve({ success: true, filename: '8' });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(a.result.current.uploadSizeLimit).toBe(8);
    expect(b.result.current.uploadSizeLimit).toBe(8);
    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it('reFetch clears the cache, re-runs the request, and clears loading (regression)', async () => {
    getMock
      .mockResolvedValueOnce({ success: true, filename: '10' })
      .mockResolvedValueOnce({ success: true, filename: '20' });
    const useUploadSizeLimit = await loadHook();

    const { result } = renderHook(() => useUploadSizeLimit(), { wrapper });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.uploadSizeLimit).toBe(10);

    await act(async () => {
      await result.current.reFetch();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getMock).toHaveBeenCalledTimes(2);
    expect(result.current.uploadSizeLimit).toBe(20);
    // Loading must return to false — before the refetchTick fix this stayed true.
    expect(result.current.loading).toBe(false);
  });
});
