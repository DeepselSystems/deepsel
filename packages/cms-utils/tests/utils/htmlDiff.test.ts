import { describe, it, expect } from 'vitest';
import { htmlDiff } from '../../src/common/utils/htmlDiff.js';

describe('htmlDiff', () => {
  it('returns input unchanged for identical content', () => {
    const html = '<p>Hello world</p>';
    expect(htmlDiff(html, html)).toBe(html);
  });

  it('wraps all text in <ins> when old is empty', () => {
    const result = htmlDiff('', '<p>Hi</p>');
    expect(result).toBe('<p><ins>Hi</ins></p>');
  });

  it('wraps all text in <del> when new is empty', () => {
    const result = htmlDiff('<p>Hi</p>', '');
    expect(result).toBe('<p><del>Hi</del></p>');
  });

  it('wraps changed word in <del> and replacement in <ins>', () => {
    const result = htmlDiff('<p>Hello world</p>', '<p>Hello Claude</p>');
    expect(result).toContain('<del>world</del>');
    expect(result).toContain('<ins>Claude</ins>');
    expect(result).not.toContain('<ins>Hello</ins>');
    expect(result).not.toContain('<del>Hello</del>');
  });

  it('does not wrap tags in <ins> or <del>', () => {
    const result = htmlDiff('<p>Hello world</p>', '<p>Hello Claude</p>');
    // tags must never appear INSIDE ins/del
    expect(result).not.toContain('<ins><p>');
    expect(result).not.toContain('<del><p>');
    // output must have closing ins/del tags (sanity)
    expect(result).toMatch(/<\/(ins|del)>/);
  });

  it('marks added word in <ins> with no <del>', () => {
    const result = htmlDiff('<p>Hello world</p>', '<p>Hello big world</p>');
    expect(result).toContain('<ins>');
    expect(result).not.toContain('<del>');
    // "big" should be wrapped (may have adjacent whitespace in same <ins>)
    expect(result).toMatch(/<ins>[^<]*big[^<]*<\/ins>/);
  });

  it('marks deleted word in <del> with no <ins>', () => {
    const result = htmlDiff('<p>Hello big world</p>', '<p>Hello world</p>');
    expect(result).toContain('<del>');
    expect(result).not.toContain('<ins>');
    expect(result).toMatch(/<del>[^<]*big[^<]*<\/del>/);
  });

  it('handles structural block addition — result is well-formed', () => {
    const result = htmlDiff('<p>A</p>', '<p>A</p><p>B</p>');
    expect(result).toContain('<ins>B</ins>');
    expect(result).not.toContain('<ins><p>');
    expect(result).not.toContain('<del><p>');
  });

  it('stripping diff markers reconstructs newHtml text content', () => {
    const oldHtml = '<p>Hello world</p>';
    const newHtml = '<p>Hello Claude</p>';
    const result = htmlDiff(oldHtml, newHtml);
    // Remove <del>...</del> content entirely (deleted text is gone in new version)
    // then remove <ins>...</ins> wrappers (keeping their content)
    const stripped = result.replace(/<del>[\s\S]*?<\/del>/g, '').replace(/<\/?(ins)>/g, '');
    expect(stripped).toBe(newHtml);
  });

  it('preserves whitespace tokens', () => {
    const oldHtml = '<p>a  b</p>';
    const newHtml = '<p>a  c</p>';
    const result = htmlDiff(oldHtml, newHtml);
    // double space must survive in output
    expect(result).toContain('  ');
    // stripping diff markers reconstructs newHtml
    const stripped = result.replace(/<del>[\s\S]*?<\/del>/g, '').replace(/<\/?(ins)>/g, '');
    expect(stripped).toBe(newHtml);
  });

  it('handles both empty inputs without throwing', () => {
    expect(() => htmlDiff('', '')).not.toThrow();
    expect(htmlDiff('', '')).toBe('');
  });
});
