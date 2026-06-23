import { describe, expect, it } from 'vitest';
import { isActiveMenu } from '../../src/menus/isActiveMenu';
import type { MenuItem } from '../../src/menus/types';
import type { WebsiteData } from '../../src/types';

function makeMenuItem(url: string): MenuItem {
  return { id: 1, title: 'Test', url, children: [], position: 0, open_in_new_tab: false };
}

function makeWebsiteData(pathname: string, lang?: string): WebsiteData {
  return {
    type: 'Page',
    data: { lang, public_settings: {} } as any,
    pathname,
  };
}

describe('isActiveMenu', () => {
  it('returns false when pathname is empty (SSR)', () => {
    expect(isActiveMenu(makeMenuItem('/'), makeWebsiteData(''))).toBe(false);
  });

  it('returns false when pathname is undefined (SSR)', () => {
    const wd = makeWebsiteData('', undefined);
    delete wd.pathname;
    expect(isActiveMenu(makeMenuItem('/'), wd)).toBe(false);
  });

  it('matches root URL exactly', () => {
    expect(isActiveMenu(makeMenuItem('/'), makeWebsiteData('/'))).toBe(true);
  });

  it('matches root with language prefix', () => {
    expect(isActiveMenu(makeMenuItem('/'), makeWebsiteData('/en', 'en'))).toBe(true);
  });

  it('matches root with language prefix and trailing slash', () => {
    expect(isActiveMenu(makeMenuItem('/'), makeWebsiteData('/en/', 'en'))).toBe(true);
  });

  it('does not match root when on another page', () => {
    expect(isActiveMenu(makeMenuItem('/'), makeWebsiteData('/about'))).toBe(false);
  });

  it('matches non-root URL exactly', () => {
    expect(isActiveMenu(makeMenuItem('/about'), makeWebsiteData('/about'))).toBe(true);
  });

  it('matches non-root URL with language prefix', () => {
    expect(isActiveMenu(makeMenuItem('/about'), makeWebsiteData('/en/about', 'en'))).toBe(true);
  });

  it('matches child route via prefix — /blog active on /blog/post', () => {
    expect(isActiveMenu(makeMenuItem('/blog'), makeWebsiteData('/blog/my-post'))).toBe(true);
  });

  it('matches child route with language prefix', () => {
    expect(isActiveMenu(makeMenuItem('/blog'), makeWebsiteData('/en/blog/my-post', 'en'))).toBe(
      true,
    );
  });

  it('does not false-match prefix — /bl should not match /blog', () => {
    expect(isActiveMenu(makeMenuItem('/bl'), makeWebsiteData('/blog'))).toBe(false);
  });

  it('does not match unrelated URL', () => {
    expect(isActiveMenu(makeMenuItem('/about'), makeWebsiteData('/contact'))).toBe(false);
  });

  it('handles null URL gracefully', () => {
    expect(isActiveMenu(makeMenuItem(null as never), makeWebsiteData('/about'))).toBe(false);
  });
});
