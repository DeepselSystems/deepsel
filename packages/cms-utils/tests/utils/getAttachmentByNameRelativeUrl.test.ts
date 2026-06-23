import { describe, expect, it } from 'vitest';
import {
  getAttachmentByNameRelativeUrl,
  getAttachmentRelativeUrl,
  getAttachmentUrl,
} from '../../src/common/utils';

describe('getAttachmentByNameRelativeUrl', () => {
  it('returns the by-name serve URL without locale by default', () => {
    expect(getAttachmentByNameRelativeUrl('hero')).toBe('/api/v1/attachment/serve-by-name/hero');
  });

  it('appends ?locale= when locale is provided', () => {
    expect(getAttachmentByNameRelativeUrl('hero', 'en')).toBe(
      '/api/v1/attachment/serve-by-name/hero?locale=en',
    );
    expect(getAttachmentByNameRelativeUrl('hero', 'de_CH')).toBe(
      '/api/v1/attachment/serve-by-name/hero?locale=de_CH',
    );
  });

  it('returns empty string when name is falsy', () => {
    expect(getAttachmentByNameRelativeUrl('')).toBe('');
    expect(getAttachmentByNameRelativeUrl(undefined as unknown as string)).toBe('');
    expect(getAttachmentByNameRelativeUrl(null)).toBe('');
  });

  it('returns empty string when name is falsy regardless of locale', () => {
    expect(getAttachmentByNameRelativeUrl('', 'en')).toBe('');
  });

  it('preserves slashes and special chars in the name as-is', () => {
    // getAttachmentByNameRelativeUrl is a thin URL builder — encoding is the caller's job.
    expect(getAttachmentByNameRelativeUrl('foo/bar')).toBe(
      '/api/v1/attachment/serve-by-name/foo/bar',
    );
  });

  it('is distinct from getAttachmentRelativeUrl (by-name vs by-storage-key)', () => {
    expect(getAttachmentByNameRelativeUrl('hero')).not.toBe(getAttachmentRelativeUrl('hero'));
    expect(getAttachmentRelativeUrl('hero')).toBe('/api/v1/attachment/serve/hero');
  });
});

describe('getAttachmentUrl (sanity — exercised by callers using new by-name endpoint)', () => {
  it('builds the absolute URL from a backend host', () => {
    expect(getAttachmentUrl('https://api.example.com', 'pic.jpg')).toBe(
      'https://api.example.com/attachment/serve/pic.jpg',
    );
  });
});
