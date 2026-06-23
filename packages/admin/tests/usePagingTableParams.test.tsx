import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { usePagingTableParams } from '../src/common/lib/hooks/usePagingTableParams';

function withRouter(initialEntries: string[]) {
  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
  );
}

describe('usePagingTableParams', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('uses initialValue when the URL has no matching param', () => {
    const { result } = renderHook(() => usePagingTableParams('page', 1), {
      wrapper: withRouter(['/']),
    });
    expect(result.current[0]).toBe(1);
  });

  it('returns the parsed positive integer when the URL has a valid value', () => {
    const { result } = renderHook(() => usePagingTableParams('page', 1), {
      wrapper: withRouter(['/?page=5']),
    });
    expect(result.current[0]).toBe(5);
  });

  it('resets to initialValue when the URL value is non-numeric (NaN)', () => {
    const { result } = renderHook(() => usePagingTableParams('page', 1), {
      wrapper: withRouter(['/?page=abc']),
    });
    expect(result.current[0]).toBe(1);
  });

  it('resets to initialValue when the URL value is 0', () => {
    const { result } = renderHook(() => usePagingTableParams('page', 1), {
      wrapper: withRouter(['/?page=0']),
    });
    expect(result.current[0]).toBe(1);
  });

  it('resets to initialValue when the URL value is negative', () => {
    const { result } = renderHook(() => usePagingTableParams('page', 2), {
      wrapper: withRouter(['/?page=-3']),
    });
    expect(result.current[0]).toBe(2);
  });

  it('setter updates state and persists', () => {
    const { result } = renderHook(() => usePagingTableParams('page', 1), {
      wrapper: withRouter(['/']),
    });
    act(() => result.current[1](7));
    expect(result.current[0]).toBe(7);
  });
});
