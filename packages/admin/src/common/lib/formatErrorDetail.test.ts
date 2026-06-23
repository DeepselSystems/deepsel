import { describe, expect, it } from 'vitest';
import { formatErrorDetail } from './formatErrorDetail';

describe('formatErrorDetail', () => {
  it('returns a plain string detail unchanged (HTTPException path)', () => {
    expect(formatErrorDetail('Not found')).toBe('Not found');
  });

  it('joins a FastAPI 422 validation array as `loc: msg` per entry', () => {
    const detail = [
      { type: 'missing', loc: ['body', 'email'], msg: 'field required', input: null },
      {
        type: 'string_too_short',
        loc: ['body', 'name'],
        msg: 'ensure this value has at least 3 characters',
        input: 'ab',
      },
    ];
    expect(formatErrorDetail(detail)).toBe(
      'body.email: field required\nbody.name: ensure this value has at least 3 characters',
    );
  });

  it('falls back to msg-only when loc is missing or empty', () => {
    expect(formatErrorDetail([{ msg: 'something went wrong' }])).toBe('something went wrong');
    expect(formatErrorDetail([{ loc: [], msg: 'no field' }])).toBe('no field');
  });

  it('stringifies non-string msg values', () => {
    expect(formatErrorDetail([{ loc: ['body', 'x'], msg: { nested: 'error' } }])).toBe(
      'body.x: {"nested":"error"}',
    );
  });

  it('handles primitive entries in the array', () => {
    expect(formatErrorDetail(['first error', 'second error'])).toBe('first error\nsecond error');
    expect(formatErrorDetail([1, 2])).toBe('1\n2');
  });

  it('JSON-stringifies a plain object detail', () => {
    expect(formatErrorDetail({ code: 'X', message: 'Y' })).toBe('{"code":"X","message":"Y"}');
  });

  it('returns "Unknown error" for null/undefined', () => {
    expect(formatErrorDetail(null)).toBe('Unknown error');
    expect(formatErrorDetail(undefined)).toBe('Unknown error');
  });

  it('coerces other primitives via String()', () => {
    expect(formatErrorDetail(42)).toBe('42');
    expect(formatErrorDetail(false)).toBe('false');
  });

  it('produces a non-empty string for the buggy old case ([object Object])', () => {
    const detail = [{ type: 'missing', loc: ['body', 'x'], msg: 'field required' }];
    const result = formatErrorDetail(detail);
    expect(result).not.toContain('[object Object]');
    expect(result).toContain('field required');
  });
});
