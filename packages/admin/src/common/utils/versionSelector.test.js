import { describe, expect, it } from 'vitest';
import { pickDefaultVersion } from './versionSelector';

describe('pickDefaultVersion', () => {
  it('returns null when versions is empty or nullish', () => {
    expect(pickDefaultVersion([], 1)).toBeNull();
    expect(pickDefaultVersion(null, 1)).toBeNull();
    expect(pickDefaultVersion(undefined, 1)).toBeNull();
  });

  it('returns the version matching the default locale id when present', () => {
    const versions = [
      { id: 10, locale_id: 1 },
      { id: 11, locale_id: 2 },
      { id: 12, locale_id: 3 },
    ];
    expect(pickDefaultVersion(versions, 2)).toEqual({ id: 11, locale_id: 2 });
  });

  it('falls back to the oldest version (lowest id) when default locale is not present', () => {
    const versions = [
      { id: 30, locale_id: 5 },
      { id: 10, locale_id: 4 },
      { id: 20, locale_id: 6 },
    ];
    expect(pickDefaultVersion(versions, 99)).toEqual({ id: 10, locale_id: 4 });
  });

  it('ignores defaultLocaleId when it is null or undefined and returns the oldest version', () => {
    const versions = [
      { id: 50, locale_id: 1 },
      { id: 5, locale_id: 2 },
    ];
    expect(pickDefaultVersion(versions, null)).toEqual({ id: 5, locale_id: 2 });
    expect(pickDefaultVersion(versions, undefined)).toEqual({ id: 5, locale_id: 2 });
  });

  it('returns the single version when versions has length 1', () => {
    const versions = [{ id: 7, locale_id: 99 }];
    expect(pickDefaultVersion(versions, 1)).toEqual({ id: 7, locale_id: 99 });
  });

  it('does not mutate the input array', () => {
    const versions = [
      { id: 3, locale_id: 1 },
      { id: 1, locale_id: 2 },
      { id: 2, locale_id: 3 },
    ];
    const snapshot = [...versions];
    pickDefaultVersion(versions, 99);
    expect(versions).toEqual(snapshot);
  });
});
