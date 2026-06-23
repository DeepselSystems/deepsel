import { describe, expect, it } from 'vitest';
import { extractDeletedIds } from './extractDeletedIds';

describe('extractDeletedIds', () => {
  it('extracts ids from an OR-of-id-equals query', () => {
    const ids = extractDeletedIds({
      OR: [
        { field: 'id', operator: '=', value: 1 },
        { field: 'id', operator: '=', value: 2 },
        { field: 'id', operator: '=', value: 'abc' },
      ],
    });
    expect(ids).toEqual([1, 2, 'abc']);
  });

  it('extracts a single id from a bare id-equals condition', () => {
    expect(extractDeletedIds({ field: 'id', operator: '=', value: 7 })).toEqual([7]);
  });

  it('returns null for an empty query (delete-all → refetch)', () => {
    expect(extractDeletedIds({})).toBeNull();
  });

  it('returns null when OR is empty', () => {
    expect(extractDeletedIds({ OR: [] })).toBeNull();
  });

  it('returns null when a condition targets a non-id field', () => {
    expect(
      extractDeletedIds({
        OR: [{ field: 'name', operator: '=', value: 'foo' }],
      }),
    ).toBeNull();
  });

  it('returns null when a condition uses a non-equals operator', () => {
    expect(extractDeletedIds({ field: 'id', operator: '!=', value: 1 })).toBeNull();
    expect(
      extractDeletedIds({
        OR: [{ field: 'id', operator: 'in', value: [1, 2] }],
      }),
    ).toBeNull();
  });

  it('returns null for AND combinator and unknown shapes', () => {
    expect(
      extractDeletedIds({
        AND: [{ field: 'id', operator: '=', value: 1 }],
      }),
    ).toBeNull();
    expect(extractDeletedIds({ foo: 'bar' })).toBeNull();
  });

  it('returns null when OR is mixed with other top-level keys', () => {
    expect(
      extractDeletedIds({
        OR: [{ field: 'id', operator: '=', value: 1 }],
        AND: [],
      }),
    ).toBeNull();
  });
});
