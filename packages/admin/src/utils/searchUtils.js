/**
 * Search utility functions for Unicode-aware text matching
 */

/**
 * Normalize text for search matching by removing diacritics and normalizing whitespace
 */
export function normalizeForSearch(text) {
  if (!text) return '';

  return text
    .toLowerCase()
    .normalize('NFD') // Decompose Unicode characters
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritical marks
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Check if text contains the search phrase (Unicode-aware)
 */
export function containsPhrase(text, searchPhrase) {
  if (!text || !searchPhrase || !searchPhrase.trim()) return false;

  const textLower = text.toLowerCase();
  const normalizedText = normalizeForSearch(text);
  const phraseLower = searchPhrase.toLowerCase().trim();
  const normalizedPhrase = normalizeForSearch(phraseLower);

  return textLower.includes(phraseLower) || normalizedText.includes(normalizedPhrase);
}

/**
 * Count how many times the search phrase appears in the text (Unicode-aware)
 */
export function countPhraseMatches(text, searchPhrase) {
  if (!text || !searchPhrase || !searchPhrase.trim()) return 0;

  const textLower = text.toLowerCase();
  const normalizedText = normalizeForSearch(text);
  const phraseLower = searchPhrase.toLowerCase().trim();
  const normalizedPhrase = normalizeForSearch(phraseLower);

  // Count matches in both original and normalized text
  const originalMatches = (textLower.match(new RegExp(escapeRegExp(phraseLower), 'gi')) || [])
    .length;
  const normalizedMatches = (
    normalizedText.match(new RegExp(escapeRegExp(normalizedPhrase), 'gi')) || []
  ).length;

  return Math.max(originalMatches, normalizedMatches);
}

/**
 * Extract plain text from page content structure
 */
export function extractPageContentText(pageContent) {
  if (typeof pageContent === 'string') {
    return pageContent
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return '';
}

/**
 * Escape special regex characters
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
