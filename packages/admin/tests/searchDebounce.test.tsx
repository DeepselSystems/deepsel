import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useModel } from '../src/common/lib/hooks';

function makeResponse(status: number, body: unknown) {
  return { status, ok: status >= 200 && status < 300, json: vi.fn().mockResolvedValue(body) } as unknown as Response;
}
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter initialEntries={['/page']}>{children}</MemoryRouter>
);
const baseConfig = (o: Record<string, unknown> = {}) => ({
  backendHost: 'https://h/api/v1', user: { id: 1 } as never, setUser: vi.fn(), ...o,
});

describe('search debounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('rapid keystrokes trigger exactly one fetch, 300ms after the last one', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(200, { data: [], total: 0 }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(
      () => useModel('user', baseConfig(), { autoFetch: true, searchFields: ['email'] }),
      { wrapper },
    );
    await act(async () => { await vi.runOnlyPendingTimersAsync(); }); // mount fetch
    fetchMock.mockClear();

    for (const ch of ['a', 'ab', 'abc']) {
      act(() => { result.current.setSearchTerm(ch); });
      await act(async () => { await vi.advanceTimersByTimeAsync(50); }); // well under 300ms
    }
    expect(fetchMock).toHaveBeenCalledTimes(0); // nothing yet — still debouncing

    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(fetchMock).toHaveBeenCalledTimes(1); // exactly one, after settle

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.search.OR).toEqual([{ field: 'email', operator: 'ilike', value: 'abc' }]);
  });
});
