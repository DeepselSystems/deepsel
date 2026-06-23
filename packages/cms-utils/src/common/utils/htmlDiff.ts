/**
 * Matches a single HTML construct as one token:
 * - an HTML tag:                <[^>]+>
 * - a word (non-tag, non-ws):   [^<\s]+
 * - a whitespace run:           \s+
 * Global flag so match() performs a full scan.
 * Invariant: tokenizeHtml(s).join('') === s (lossless).
 */
const HTML_TOKEN_REGEX = /<[^>]+>|[^<\s]+|\s+/g;

/**
 * Matches a token that is a complete HTML tag (opening, closing, or self-closing).
 * Tag tokens are emitted raw and are NEVER wrapped in <ins> or <del>.
 */
const TAG_TOKEN_REGEX = /^<[^>]+>$/;

/** The kind of edit a token represents in the diff output. */
type DiffOp = 'keep' | 'insert' | 'delete';

/** A single token paired with its edit operation, produced by LCS backtrack. */
interface DiffToken {
  op: DiffOp;
  value: string;
}

/**
 * Splits an HTML string into tag, word, and whitespace tokens.
 * Tags are kept as single tokens; text is split by whitespace.
 * Empty string returns [].
 */
function tokenizeHtml(html: string): string[] {
  // Reset lastIndex — match() with /g on a module-level regex is safe
  // because String.prototype.match() always resets it before scanning.
  return html.match(HTML_TOKEN_REGEX) ?? [];
}

/**
 * Computes a token-level diff between two token arrays using LCS.
 * Trims common prefix and suffix before running DP to reduce O(n×m) scope.
 */
function diffTokens(oldTokens: string[], newTokens: string[]): DiffToken[] {
  const result: DiffToken[] = [];

  // Trim common prefix
  let start = 0;
  while (
    start < oldTokens.length &&
    start < newTokens.length &&
    oldTokens[start] === newTokens[start]
  ) {
    result.push({ op: 'keep', value: oldTokens[start] });
    start++;
  }

  // Trim common suffix (collect separately, append at end)
  const suffix: DiffToken[] = [];
  let oldEnd = oldTokens.length - 1;
  let newEnd = newTokens.length - 1;
  while (oldEnd >= start && newEnd >= start && oldTokens[oldEnd] === newTokens[newEnd]) {
    suffix.unshift({ op: 'keep', value: oldTokens[oldEnd] });
    oldEnd--;
    newEnd--;
  }

  // Middle slices
  const oldMid = oldTokens.slice(start, oldEnd + 1);
  const newMid = newTokens.slice(start, newEnd + 1);
  const m = oldMid.length;
  const n = newMid.length;

  // LCS DP table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldMid[i - 1] === newMid[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to produce ops in forward order
  const middle: DiffToken[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldMid[i - 1] === newMid[j - 1]) {
      middle.unshift({ op: 'keep', value: oldMid[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      middle.unshift({ op: 'insert', value: newMid[j - 1] });
      j--;
    } else {
      middle.unshift({ op: 'delete', value: oldMid[i - 1] });
      i--;
    }
  }

  return [...result, ...middle, ...suffix];
}

/**
 * Reconstructs an HTML string from a diff token list.
 * Uses dual buffers so <del> always precedes <ins> within a changed region.
 * Tag tokens are always emitted raw, regardless of their diff op.
 */
function reconstruct(diff: DiffToken[]): string {
  const out: string[] = [];
  let delBuf: string[] = [];
  let insBuf: string[] = [];

  const flushBoth = (): void => {
    if (delBuf.length) {
      out.push('<del>' + delBuf.join('') + '</del>');
      delBuf = [];
    }
    if (insBuf.length) {
      out.push('<ins>' + insBuf.join('') + '</ins>');
      insBuf = [];
    }
  };

  for (const { op, value } of diff) {
    if (TAG_TOKEN_REGEX.test(value)) {
      // Tags always emitted raw — never wrapped in <ins>/<del>
      flushBoth();
      out.push(value);
    } else if (op === 'keep') {
      flushBoth();
      out.push(value);
    } else if (op === 'delete') {
      delBuf.push(value);
    } else {
      insBuf.push(value);
    }
  }
  flushBoth();
  return out.join('');
}

/**
 * Produces an HTML string with <ins> (added) and <del> (removed) tags
 * highlighting word-level differences between two HTML strings.
 *
 * Both inputs are expected to be clean, tag-balanced HTML (e.g. TipTap output).
 * Pass Jinja2-rendered HTML — not raw template source.
 *
 * @param oldHtml - The baseline HTML string
 * @param newHtml - The new HTML string to compare against
 * @returns HTML string with <ins>/<del> wrapping changed word runs
 *
 * @remarks
 * Tag tokens are never wrapped in <ins>/<del> — only text and whitespace tokens
 * are highlighted. Tag-type replacements (e.g. &lt;p&gt; → &lt;strong&gt;) may
 * produce unbalanced nesting; this is accepted for CMS text-level revision diffs.
 */
export function htmlDiff(oldHtml: string, newHtml: string): string {
  if (oldHtml === newHtml) return newHtml;
  const oldTokens = tokenizeHtml(oldHtml);
  const newTokens = tokenizeHtml(newHtml);
  const diff = diffTokens(oldTokens, newTokens);
  return reconstruct(diff);
}
