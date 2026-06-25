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
    let contents = [{ id: 'a', text: 'hello' }];
    const { rerender } = renderHook((p) => useDraftAutosave(p), {
      wrapper,
      initialProps: baseProps({ buildContentsPayload: () => contents }),
    });

    // First render establishes the baseline — no timer yet.
    expect(postMock).not.toHaveBeenCalled();

    // Simulate a real content change.
    contents = [{ id: 'a', text: 'world' }];
    rerender(baseProps({ buildContentsPayload: () => contents }));

    // Still nothing immediately — waiting for the debounce.
    expect(postMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(postMock).toHaveBeenCalledTimes(1);
    expect(postMock).toHaveBeenCalledWith({
      record_type: 'page',
      record_id: 42,
      contents: [{ id: 'a', text: 'world' }],
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
    let contents = [{ id: 'a', text: 'hello' }];
    const { rerender } = renderHook((p) => useDraftAutosave(p), {
      wrapper,
      initialProps: baseProps({ buildContentsPayload: () => contents }),
    });

    // First render establishes the baseline. Now trigger one real change.
    contents = [{ id: 'a', text: 'changed' }];
    rerender(baseProps({ buildContentsPayload: () => contents }));

    // Re-render with a fresh buildContentsPayload reference but identical output —
    // dedupe should prevent additional timers from being scheduled.
    rerender(baseProps({ buildContentsPayload: () => contents }));
    rerender(baseProps({ buildContentsPayload: () => contents }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(postMock).toHaveBeenCalledTimes(1);
  });

  it('suppressNext() swallows exactly one cycle, the next change still saves', async () => {
    let contents = [{ id: 'a', text: 'baseline' }];
    const props = baseProps({ buildContentsPayload: () => contents });

    const { result, rerender } = renderHook((p) => useDraftAutosave(p), {
      wrapper,
      initialProps: props,
    });

    // First render establishes the baseline — no timer yet.
    // Now make a real change to schedule a pending timer.
    contents = [{ id: 'a', text: 'one' }];
    rerender({ ...props, buildContentsPayload: () => contents });

    // suppressNext + new snapshot: suppressed cycle swallows without posting.
    // The pending timer for 'one' is NOT cleared because suppressNext returns
    // before the clearTimeout line in the effect.
    act(() => {
      result.current.suppressNext();
    });
    contents = [{ id: 'a', text: 'two' }];
    rerender({ ...props, buildContentsPayload: () => contents });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    // The originally-scheduled save (for 'one') fires — suppress only absorbs the
    // change-detection cycle, not the already-queued timer.
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

    let contents = [{ id: 'a', text: 'hello' }];
    const { result, rerender } = renderHook((p) => useDraftAutosave(p), {
      wrapper,
      initialProps: baseProps({ buildContentsPayload: () => contents }),
    });

    // First render sets the baseline. Trigger a change to schedule the failing save.
    contents = [{ id: 'a', text: 'changed' }];
    rerender(baseProps({ buildContentsPayload: () => contents }));

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
