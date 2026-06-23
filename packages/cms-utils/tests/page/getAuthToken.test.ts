import { describe, expect, it } from 'vitest';
import { getAuthToken } from '../../src/page/getAuthToken';

function createAstroStub({
  cookie,
  url = 'https://example.com/',
}: {
  cookie?: string;
  url?: string;
}) {
  return {
    request: {
      headers: new Map(cookie ? [['cookie', cookie]] : []),
    },
    url: new URL(url, 'https://example.com'),
  };
}

describe('getAuthToken', () => {
  it('prioritizes the token found inside cookies', () => {
    const astro = createAstroStub({
      cookie: 'token=abc123; other=value',
      url: 'https://example.com/?token=query',
    });

    expect(getAuthToken(astro)).toBe('abc123');
  });

  it('falls back to known alternative cookie names', () => {
    const astro = createAstroStub({
      cookie: 'authToken=secret987',
    });

    expect(getAuthToken(astro)).toBe('secret987');
  });

  it('uses the URL search parameter when cookies lack a token', () => {
    const astro = createAstroStub({
      url: 'https://example.com/?token=queryToken',
    });

    expect(getAuthToken(astro)).toBe('queryToken');
  });

  it('returns null when nothing is provided', () => {
    const astro = createAstroStub({});
    expect(getAuthToken(astro)).toBeNull();
  });
});
