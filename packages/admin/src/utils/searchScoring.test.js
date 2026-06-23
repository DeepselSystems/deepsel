import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { calculateRelevanceScore, sortSearchResults } from './searchScoring.js';

const NOW = new Date('2026-05-22T12:00:00Z');

describe('calculateRelevanceScore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns 0 when there is no search query', () => {
    expect(calculateRelevanceScore({}, { title: 'x', content: 'y' }, '', 'Page')).toBe(0);
  });

  it('weights title matches 3x and content matches 1x', () => {
    const score = calculateRelevanceScore(
      {},
      { title: 'foo and foo', content: 'foo bar foo' },
      'foo',
      'Page',
    );
    // 2 title matches * 3 + 2 content matches * 1 = 8
    expect(score).toBe(8);
  });

  it('extracts text from HTML content for Page entries', () => {
    const score = calculateRelevanceScore(
      {},
      { title: 'foo', content: '<p>foo</p><b>foo</b>' },
      'foo',
      'Page',
    );
    expect(score).toBe(1 * 3 + 2 * 1);
  });

  it('treats Blog content as raw text (no HTML stripping)', () => {
    const score = calculateRelevanceScore(
      {},
      { title: 'foo', content: 'foo foo foo' },
      'foo',
      'Blog',
    );
    expect(score).toBe(1 * 3 + 3 * 1);
  });

  it('adds +10 recency bonus for Blog posts within 30 days', () => {
    const score = calculateRelevanceScore(
      { publish_date: new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString() },
      { title: 'foo', content: '' },
      'foo',
      'Blog',
    );
    expect(score).toBe(3 + 10);
  });

  it('adds +5 recency bonus for Blog posts within 90 days', () => {
    const score = calculateRelevanceScore(
      { publish_date: new Date(NOW.getTime() - 45 * 24 * 60 * 60 * 1000).toISOString() },
      { title: 'foo', content: '' },
      'foo',
      'Blog',
    );
    expect(score).toBe(3 + 5);
  });

  it('adds no recency bonus past 90 days', () => {
    const score = calculateRelevanceScore(
      { publish_date: new Date(NOW.getTime() - 120 * 24 * 60 * 60 * 1000).toISOString() },
      { title: 'foo', content: '' },
      'foo',
      'Blog',
    );
    expect(score).toBe(3);
  });

  it('adds no recency bonus for Page entries even if very recent', () => {
    const score = calculateRelevanceScore(
      { publish_date: new Date(NOW.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString() },
      { title: 'foo', content: '' },
      'foo',
      'Page',
    );
    expect(score).toBe(3);
  });

  it('adds no recency bonus when publish_date is missing', () => {
    const score = calculateRelevanceScore({}, { title: 'foo', content: '' }, 'foo', 'Blog');
    expect(score).toBe(3);
  });
});

describe('sortSearchResults', () => {
  it('sorts by relevance score descending (primary)', () => {
    const sorted = sortSearchResults([
      { relevanceScore: 1, contentType: 'Page' },
      { relevanceScore: 5, contentType: 'Page' },
      { relevanceScore: 3, contentType: 'Page' },
    ]);
    expect(sorted.map((r) => r.relevanceScore)).toEqual([5, 3, 1]);
  });

  it('breaks Blog-vs-Blog ties by publishDate descending', () => {
    const sorted = sortSearchResults([
      { relevanceScore: 5, contentType: 'Blog', publishDate: '2026-01-01' },
      { relevanceScore: 5, contentType: 'Blog', publishDate: '2026-05-01' },
      { relevanceScore: 5, contentType: 'Blog', publishDate: '2026-03-01' },
    ]);
    expect(sorted.map((r) => r.publishDate)).toEqual(['2026-05-01', '2026-03-01', '2026-01-01']);
  });

  it('places Blog before Page on a cross-type tie', () => {
    const sorted = sortSearchResults([
      { id: 1, relevanceScore: 5, contentType: 'Page' },
      { id: 2, relevanceScore: 5, contentType: 'Blog', publishDate: '2026-01-01' },
    ]);
    expect(sorted.map((r) => r.id)).toEqual([2, 1]);
  });

  it('leaves Page-vs-Page order untouched on a tie', () => {
    const sorted = sortSearchResults([
      { id: 'a', relevanceScore: 5, contentType: 'Page' },
      { id: 'b', relevanceScore: 5, contentType: 'Page' },
      { id: 'c', relevanceScore: 5, contentType: 'Page' },
    ]);
    expect(sorted.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
});
