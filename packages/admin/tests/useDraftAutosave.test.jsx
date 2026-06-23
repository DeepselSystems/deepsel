import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const postMock = vi.fn();

vi.mock('../src/common/api/useFetch.js', () => ({
  default: () => ({ post: postMock }),
}));

import useDraftAutosave from '../src/common/hooks/useDraftAutosave.js';

const wrapper = ({ children }) => <MemoryRouter>{children}</MemoryRouter>;

const baseProps = (overrides = {}) => ({
  recordType: 'page',
  recordId: 42,
  enabled: true,
  buildContentsPayload: vi.fn(() => [{ id: 'a', text: 'hello' }]),
  parentFields: null,
  ...overrides,
});

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('useDraftAutosave', () => {
  beforeEach(() => {
    postMock.mockReset();
    postMock.mockResolvedValue(undefined);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces a save 2s after a content change', async () => {
    const props = baseProps();
    renderHook(() => useDraftAutosave(props), { wrapper });

    // Effect ran, timer set; nothing should have posted yet.
    expect(postMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(postMock).toHaveBeenCalledTimes(1);
    expect(postMock).toHaveBeenCalledWith({
      record_type: 'page',
      record_id: 42,
      contents: [{ id: 'a', text: 'hello' }],
      parent_fields: null,
    });
  });

  it('does not save when disabled, recordId missing, or contents empty', async () => {
    const { rerender } = renderHook((p) => useDraftAutosave(p), {
      wrapper,
      initialProps: baseProps({ enabled: false }),
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(postMock).not.toHaveBeenCalled();

    rerender(baseProps({ recordId: null }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(postMock).not.toHaveBeenCalled();

    rerender(baseProps({ buildContentsPayload: () => [] }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(postMock).not.toHaveBeenCalled();
  });

  it('dedupes identical snapshots (one save across re-renders)', async () => {
    const { rerender } = renderHook((p) => useDraftAutosave(p), {
      wrapper,
      initialProps: baseProps(),
    });

    // Re-render with a fresh buildContentsPayload but identical output
    rerender(baseProps());
    rerender(baseProps());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(postMock).toHaveBeenCalledTimes(1);
  });

  it('suppressNext() swallows exactly one cycle, the next change still saves', async () => {
    let contents = [{ id: 'a', text: 'one' }];
    const props = baseProps({ buildContentsPayload: () => contents });

    const { result, rerender } = renderHook((p) => useDraftAutosave(p), {
      wrapper,
      initialProps: props,
    });

    // First effect run scheduled a save. Clear it via suppressNext + new snapshot.
    act(() => {
      result.current.suppressNext();
    });
    contents = [{ id: 'a', text: 'two' }];
    rerender({ ...props, buildContentsPayload: () => contents });

    // suppressed cycle should swallow without posting after debounce
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    // The originally-scheduled save (from the very first render with 'one')
    // still fires because suppressNext only swallows the NEXT change cycle,
    // not the pending timer. So we expect one post here.
    expect(postMock).toHaveBeenCalledTimes(1);
    expect(postMock.mock.calls[0][0].contents).toEqual([{ id: 'a', text: 'one' }]);

    // A subsequent real change should save again.
    contents = [{ id: 'a', text: 'three' }];
    rerender({ ...props, buildContentsPayload: () => contents });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(postMock).toHaveBeenCalledTimes(2);
    expect(postMock.mock.calls[1][0].contents).toEqual([{ id: 'a', text: 'three' }]);
  });

  it('flushNow clears the pending timer and saves immediately', async () => {
    // Use the same content the build function returns so the dedupe ref aligns
    // afterward — mirrors real callers that read live state and pass it to flushNow.
    const contents = [{ id: 'a', text: 'hello' }];
    const { result } = renderHook(
      () => useDraftAutosave(baseProps({ buildContentsPayload: () => contents })),
      { wrapper },
    );

    await act(async () => {
      await result.current.flushNow(contents);
    });

    expect(postMock).toHaveBeenCalledTimes(1);
    expect(postMock).toHaveBeenCalledWith({
      record_type: 'page',
      record_id: 42,
      contents,
      parent_fields: null,
    });

    // The originally-scheduled timer should have been cleared and the dedupe
    // ref matches the just-flushed snapshot — so no further post fires once we
    // advance past the debounce window.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(postMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces an error status when the post rejects, without throwing', async () => {
    const err = new Error('save failed');
    postMock.mockRejectedValueOnce(err);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useDraftAutosave(baseProps()), { wrapper });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
      await flushMicrotasks();
    });

    expect(result.current.status).toBe('error');
    errorSpy.mockRestore();
  });

  it('unmount cancels a pending save', async () => {
    const { unmount } = renderHook(() => useDraftAutosave(baseProps()), { wrapper });

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(postMock).not.toHaveBeenCalled();
  });
});
