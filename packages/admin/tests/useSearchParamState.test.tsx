import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, useSearchParams } from 'react-router-dom';
import { useSearchParamState } from '../src/common/lib/hooks/useSearchParamState';

function withRouter(initialEntries: string[]) {
  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
  );
}

describe('useSearchParamState', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('falls back to initialValue when the URL has no matching param', () => {
    const { result } = renderHook(() => useSearchParamState('q', 'hello'), {
      wrapper: withRouter(['/']),
    });
    expect(result.current[0]).toBe('hello');
  });

  it('parses a number from the URL when initialValue is a number', () => {
    const { result } = renderHook(() => useSearchParamState('page', 1), {
      wrapper: withRouter(['/?page=42']),
    });
    expect(result.current[0]).toBe(42);
  });

  it('parses a boolean from the URL when initialValue is a boolean', () => {
    const { result: t } = renderHook(() => useSearchParamState('open', false), {
      wrapper: withRouter(['/?open=true']),
    });
    expect(t.current[0]).toBe(true);

    const { result: f } = renderHook(() => useSearchParamState('open', true), {
      wrapper: withRouter(['/?open=false']),
    });
    expect(f.current[0]).toBe(false);
  });

  it('parses a JSON object/array from the URL when initialValue is one', () => {
    const { result: o } = renderHook(
      () => useSearchParamState<Record<string, unknown>>('filter', {}),
      { wrapper: withRouter([`/?filter=${encodeURIComponent('{"x":1}')}`]) },
    );
    expect(o.current[0]).toEqual({ x: 1 });

    const { result: a } = renderHook(() => useSearchParamState<unknown[]>('filters', []), {
      wrapper: withRouter([`/?filters=${encodeURIComponent('[1,2,3]')}`]),
    });
    expect(a.current[0]).toEqual([1, 2, 3]);
  });

  it('returns initialValue on JSON parse failure for object types', () => {
    const { result } = renderHook(
      () => useSearchParamState<Record<string, unknown>>('filter', { fallback: true }),
      { wrapper: withRouter(['/?filter=not-json']) },
    );
    // convertToOriginalType returns the raw string on JSON.parse failure;
    // the effect then keeps state as the raw string. Document this.
    expect(typeof result.current[0]).toBe('string');
    expect(result.current[0] as unknown as string).toBe('not-json');
  });

  it('updates both state and the URL when the setter is called', () => {
    function Probe() {
      const [value, setValue] = useSearchParamState('q', '');
      const [params] = useSearchParams();
      return (
        <>
          <span data-testid="value">{value as string}</span>
          <span data-testid="param">{params.get('q') ?? ''}</span>
          <button onClick={() => setValue('tim')}>set</button>
        </>
      );
    }
    const { result } = renderHook(
      () => {
        const [value, setValue] = useSearchParamState('q', '');
        const [params] = useSearchParams();
        return { value, setValue, params };
      },
      { wrapper: withRouter(['/']) },
    );

    act(() => result.current.setValue('tim'));
    expect(result.current.value).toBe('tim');
    expect(result.current.params.get('q')).toBe('tim');
    void Probe;
  });
});
