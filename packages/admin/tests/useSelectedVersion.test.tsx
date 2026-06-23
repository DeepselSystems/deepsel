import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSelectedVersion } from '../src/common/hooks/useSelectedVersion';

const en = (id: number = 10) => ({ id, locale_id: 1, name: 'en.jpg' });
const de = (id: number = 11) => ({ id, locale_id: 2, name: 'de.jpg' });
const fr = (id: number = 12) => ({ id, locale_id: 3, name: 'fr.jpg' });

describe('useSelectedVersion', () => {
  it('auto-picks the default-locale version on mount', () => {
    const { result } = renderHook(() => useSelectedVersion([en(), de(), fr()], 2));
    expect(result.current.selectedVersion?.locale_id).toBe(2);
    expect(result.current.selectedLocaleId).toBe(2);
  });

  it('falls back to the lowest-id version when default locale is absent', () => {
    const { result } = renderHook(() => useSelectedVersion([fr(50), en(5), de(20)], 99));
    expect(result.current.selectedVersion?.id).toBe(5);
  });

  it('explicit selection overrides the auto-pick', () => {
    const { result } = renderHook(() => useSelectedVersion([en(), de(), fr()], 1));
    expect(result.current.selectedLocaleId).toBe(1);

    act(() => result.current.setSelectedLocale(3));
    expect(result.current.selectedLocaleId).toBe(3);
    expect(result.current.selectedVersion?.locale_id).toBe(3);
  });

  it('returns selectedVersion=null when the selected locale has no uploaded file yet', () => {
    // User clicks a locale flag for which no version exists; selectedLocaleId
    // still reflects the click but selectedVersion is null so the card shows a placeholder.
    const { result } = renderHook(() => useSelectedVersion([en()], 1));
    act(() => result.current.setSelectedLocale(99));
    expect(result.current.selectedLocaleId).toBe(99);
    expect(result.current.selectedVersion).toBeNull();
  });

  it('returns selectedVersion=null when versions is empty', () => {
    const { result } = renderHook(() => useSelectedVersion([], 1));
    expect(result.current.selectedVersion).toBeNull();
    expect(result.current.selectedLocaleId).toBeNull();
  });

  it('exposes the input versions through availableVersions', () => {
    const versions = [en(), de()];
    const { result } = renderHook(() => useSelectedVersion(versions, 1));
    expect(result.current.availableVersions).toBe(versions);
  });
});
