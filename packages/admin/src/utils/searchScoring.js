/**
 * Search scoring utilities for calculating relevance
 */

import { countPhraseMatches, extractPageContentText } from './searchUtils.js';

/**
 * Calculate relevance score for search results
 */
export function calculateRelevanceScore(item, content, searchQuery, contentType) {
  if (!searchQuery) return 0;

  let score = 0;

  // Title matches (higher weight) - Unicode-aware phrase matching only
  if (content.title) {
    const titleMatches = countPhraseMatches(content.title, searchQuery);
    score += titleMatches * 3;
  }

  // Content matches - handle different content structures
  let contentText = '';
  if (contentType === 'Blog') {
    contentText = content.content || '';
  } else if (contentType === 'Page') {
    contentText = extractPageContentText(content.content);
  }

  if (contentText) {
    const contentMatches = countPhraseMatches(contentText, searchQuery);
    score += contentMatches * 1;
  }

  // Recency bonus (newer is better) - only for blog posts that have publish_date
  if (contentType === 'Blog' && item.publish_date) {
    const publishDate = new Date(item.publish_date);
    const now = new Date();
    const daysDiff = Math.floor((now - publishDate) / (1000 * 60 * 60 * 24));

    // Add recency bonus (decreases over time)
    if (daysDiff <= 30) {
      score += 10; // Recent posts get bonus
    } else if (daysDiff <= 90) {
      score += 5; // Somewhat recent posts get smaller bonus
    }
  }

  return score;
}

/**
 * Sort search results by relevance score and secondary criteria
 */
export function sortSearchResults(results) {
  return results.sort((a, b) => {
    // Primary sort: relevance score (descending)
    if (a.relevanceScore !== b.relevanceScore) {
      return b.relevanceScore - a.relevanceScore;
    }

    // Secondary sort for same relevance score:
    // - Blog posts: sort by publish date (newest first)
    // - Pages: maintain original order
    // - Blog posts come before pages with same relevance

    if (a.contentType === 'Blog' && b.contentType === 'Blog') {
      // Both are blogs: sort by publish date (newest first)
      const dateA = new Date(a.publishDate);
      const dateB = new Date(b.publishDate);
      return dateB - dateA;
    }

    if (a.contentType === 'Blog' && b.contentType === 'Page') {
      // Blog comes before page with same relevance
      return -1;
    }

    if (a.contentType === 'Page' && b.contentType === 'Blog') {
      // Blog comes before page with same relevance
      return 1;
    }

    // Both are pages: maintain original order (no secondary sort)
    return 0;
  });
}
