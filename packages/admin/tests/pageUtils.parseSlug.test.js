import { describe, it, expect } from 'vitest';
import { parseSlugForLangAndPath } from '../src/utils/pageUtils.js';

describe('parseSlugForLangAndPath', () => {
  it('extracts the language prefix and remaining path', () => {
    expect(parseSlugForLangAndPath('en/blog/post-1')).toEqual({
      lang: 'en',
      path: '/blog/post-1',
    });
  });

  it('defaults to root path when only a language is present', () => {
    expect(parseSlugForLangAndPath('es')).toEqual({ lang: 'es', path: '/' });
  });

  it('treats slug without a valid language prefix as a raw path', () => {
    expect(parseSlugForLangAndPath('about/contact')).toEqual({
      lang: null,
      path: '/about/contact',
    });
  });

  it('returns root for empty or null input', () => {
    expect(parseSlugForLangAndPath('')).toEqual({ lang: null, path: '/' });
    expect(parseSlugForLangAndPath(null)).toEqual({ lang: null, path: '/' });
  });

  it('tolerates leading and trailing slashes', () => {
    expect(parseSlugForLangAndPath('/en/blog/')).toEqual({ lang: 'en', path: '/blog' });
    expect(parseSlugForLangAndPath('/about/')).toEqual({ lang: null, path: '/about' });
  });

  it('does not treat an unrecognised first segment as a language', () => {
    // "xx" is not in the locales list — it's a normal path segment.
    expect(parseSlugForLangAndPath('xx/page')).toEqual({ lang: null, path: '/xx/page' });
  });
});
