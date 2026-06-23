/**
 * Constants for Jinja2 syntax highlighting
 * BE CAREFUL TO EDIT THIS - IT AFFECTS OLDER DATA
 */
export const JINJA2_ATTRIBUTES = {
  CLASS: 'jinja2-syntax',
} as const;

/**
 * Regular expressions for Jinja2 template syntax patterns
 */
export const JINJA2_PATTERNS = [
  /\{\{[^}]*\}\}/g, // {{ variable }}
  /\{%[^%]*%\}/g, // {% tag %}
  /\{#[^#]*#\}/g, // {# comment #}
];

/**
 * Check if text contains Jinja2 syntax
 * @param {string} text - Text to check
 * @returns {boolean} True if text contains Jinja2 syntax
 */
export const containsJinja2Syntax = (text: string): boolean => {
  if (!text) return false;
  return JINJA2_PATTERNS.some((pattern) => pattern.test(text));
};

/**
 * Find all Jinja2 syntax matches in text
 * @param {string} text - Text to search
 * @returns {Array<{start: number, end: number, match: string}>} Array of match positions
 */
export const findJinja2Matches = (
  text: string,
): Array<{ start: number; end: number; match: string }> => {
  const matches: Array<{ start: number; end: number; match: string }> = [];

  JINJA2_PATTERNS.forEach((pattern) => {
    const regex = new RegExp(pattern);
    let match;
    while ((match = regex.exec(text)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        match: match[0],
      });
    }
  });

  return matches;
};

/**
 * Check if a rendered HTML container contains any Jinja2 syntax
 * @param {HTMLElement} container - The container element to check
 * @returns {boolean} True if container has Jinja2 syntax
 */
export const containsJinja2InRenderedContent = (container: HTMLElement | null): boolean => {
  if (!container) return false;
  const text = container.textContent || '';
  return JINJA2_PATTERNS.some((pattern) => {
    const regex = new RegExp(pattern.source, pattern.flags);
    return regex.test(text);
  });
};

/**
 * Walk rendered HTML and wrap Jinja2 syntax in <code class="jinja2-syntax"> elements.
 * Skips text nodes inside <code>, <pre>, or enhanced code block wrappers.
 * Also hides block-level elements that contain only Jinja2 control structure tags
 * ({% %}) since these produce no output in a properly-rendered template and
 * cause layout disruption when backend Jinja2 rendering fails.
 * @param {HTMLElement} container - The container element to process
 */
export const initializeJinja2InRenderedContent = (container: HTMLElement | null): void => {
  if (!container) return;

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes: Node[] = [];

  let node: Node | null;
  while ((node = walker.nextNode())) {
    // Skip nodes inside code/pre or enhanced code block wrappers
    let ancestor = node.parentElement;
    let skip = false;
    while (ancestor && ancestor !== container) {
      const tag = ancestor.tagName ? ancestor.tagName.toLowerCase() : '';
      if (
        tag === 'code' ||
        tag === 'pre' ||
        ancestor.classList.contains('enhanced-code-block-wrapper') ||
        ancestor.classList.contains('enhanced-code-block-content')
      ) {
        skip = true;
        break;
      }
      ancestor = ancestor.parentElement;
    }
    if (!skip) {
      textNodes.push(node);
    }
  }

  textNodes.forEach((textNode) => {
    const text = textNode.nodeValue;
    if (!text) return;

    // Collect all matches across all patterns
    const matches: Array<{ start: number; end: number; match: string }> = [];
    JINJA2_PATTERNS.forEach((pattern) => {
      const regex = new RegExp(pattern.source, pattern.flags);
      let m: RegExpExecArray | null;
      while ((m = regex.exec(text)) !== null) {
        matches.push({
          start: m.index,
          end: m.index + m[0].length,
          match: m[0],
        });
      }
    });

    if (matches.length === 0) return;

    // Sort by start position and remove overlaps
    matches.sort((a, b) => a.start - b.start);

    const fragment = document.createDocumentFragment();
    let cursor = 0;

    matches.forEach(({ start, end, match }) => {
      if (start < cursor) return; // skip overlapping
      if (start > cursor) {
        fragment.appendChild(document.createTextNode(text.slice(cursor, start)));
      }
      const code = document.createElement('code');
      code.className = JINJA2_ATTRIBUTES.CLASS;
      code.textContent = match;
      fragment.appendChild(code);
      cursor = end;
    });

    if (cursor < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(cursor)));
    }

    textNode.parentNode!.replaceChild(fragment, textNode);
  });

  // Hide block-level elements that contain only Jinja2 control structure tags
  // ({% %}) — these would produce no visible output in a properly-rendered Jinja2
  // template and cause layout disruption when the backend rendering fails.
  container.querySelectorAll<HTMLElement>('p, h1, h2, h3, h4, h5, h6, li').forEach((el) => {
    // Skip elements inside code/pre blocks
    let ancestor = el.parentElement;
    let skip = false;
    while (ancestor && ancestor !== container) {
      const tag = ancestor.tagName ? ancestor.tagName.toLowerCase() : '';
      if (
        tag === 'code' ||
        tag === 'pre' ||
        ancestor.classList.contains('enhanced-code-block-wrapper')
      ) {
        skip = true;
        break;
      }
      ancestor = ancestor.parentElement;
    }
    if (skip) return;

    // Check if all non-whitespace content consists of Jinja2 control structure code
    let hasControlCode = false;
    const allJinja2Control = Array.from(el.childNodes).every((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        return !child.nodeValue?.trim();
      }
      if (
        child.nodeType === Node.ELEMENT_NODE &&
        (child as HTMLElement).tagName === 'CODE' &&
        (child as HTMLElement).classList.contains(JINJA2_ATTRIBUTES.CLASS)
      ) {
        // Only {% %} control tags — not {{ }} output or {# #} comments
        if (/^\{%/.test((child as HTMLElement).textContent?.trim() || '')) {
          hasControlCode = true;
          return true;
        }
      }
      return false;
    });

    if (allJinja2Control && hasControlCode) {
      el.style.display = 'none';
    }
  });
};
