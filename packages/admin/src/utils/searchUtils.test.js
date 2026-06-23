import { describe, it, expect } from 'vitest';
import {
  normalizeForSearch,
  containsPhrase,
  countPhraseMatches,
  extractPageContentText,
} from './searchUtils.js';

describe('normalizeForSearch', () => {
  it('returns empty string for falsy input', () => {
    expect(normalizeForSearch('')).toBe('');
    expect(normalizeForSearch(null)).toBe('');
    expect(normalizeForSearch(undefined)).toBe('');
  });

  it('lowercases and strips diacritics', () => {
    expect(normalizeForSearch('Café')).toBe('cafe');
    expect(normalizeForSearch('NAÏVE résumé')).toBe('naive resume');
  });

  it('collapses runs of whitespace and trims', () => {
    expect(normalizeForSearch('  hello   world  ')).toBe('hello world');
  });
});

describe('containsPhrase', () => {
  it('returns false for empty inputs or whitespace-only phrase', () => {
    expect(containsPhrase('', 'x')).toBe(false);
    expect(containsPhrase('x', '')).toBe(false);
    expect(containsPhrase('x', '   ')).toBe(false);
  });

  it('matches case-insensitively', () => {
    expect(containsPhrase('Hello World', 'hello')).toBe(true);
    expect(containsPhrase('Hello World', 'WORLD')).toBe(true);
  });

  it('matches a phrase against a diacritic-stripped form of the text', () => {
    expect(containsPhrase('CAFÉ Culture', 'cafe')).toBe(true);
    expect(containsPhrase('cafe culture', 'café')).toBe(true);
  });

  it('returns false when the phrase is not present', () => {
    expect(containsPhrase('Hello World', 'galaxy')).toBe(false);
  });
});

describe('countPhraseMatches', () => {
  it('returns 0 for empty input or empty phrase', () => {
    expect(countPhraseMatches('', 'x')).toBe(0);
    expect(countPhraseMatches('x', '')).toBe(0);
  });

  it('counts case-insensitively', () => {
    expect(countPhraseMatches('cat cat CAT', 'cat')).toBe(3);
  });

  it('takes max(original, normalized) when accents differ', () => {
    expect(countPhraseMatches('café CAFÉ cafe', 'cafe')).toBe(3);
  });

  it('escapes regex special characters in the phrase', () => {
    expect(countPhraseMatches('price: $5 and $5', '$5')).toBe(2);
    expect(countPhraseMatches('a.b.c a.b.c', 'a.b.c')).toBe(2);
  });
});

describe('extractPageContentText', () => {
  it('strips HTML tags and normalises whitespace', () => {
    expect(extractPageContentText('<p>Hello</p><b>World</b>')).toBe('Hello World');
  });

  it('returns empty for non-string input', () => {
    expect(extractPageContentText(null)).toBe('');
    expect(extractPageContentText({})).toBe('');
    expect(extractPageContentText(42)).toBe('');
  });
});
