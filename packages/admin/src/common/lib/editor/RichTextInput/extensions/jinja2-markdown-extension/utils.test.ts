import { describe, it, expect, beforeEach } from 'vitest';
import {
  containsJinja2Syntax,
  findJinja2Matches,
  containsJinja2InRenderedContent,
  initializeJinja2InRenderedContent,
  JINJA2_ATTRIBUTES,
} from './utils';

describe('containsJinja2Syntax', () => {
  it('returns false for empty / non-Jinja text', () => {
    expect(containsJinja2Syntax('')).toBe(false);
    expect(containsJinja2Syntax('hello world')).toBe(false);
    expect(containsJinja2Syntax('{not jinja')).toBe(false);
  });

  it('detects {{ expression }}, {% tag %}, and {# comment #}', () => {
    expect(containsJinja2Syntax('Hello {{ name }}')).toBe(true);
    expect(containsJinja2Syntax('{% if x %}')).toBe(true);
    expect(containsJinja2Syntax('{# comment #}')).toBe(true);
  });
});

describe('findJinja2Matches', () => {
  it('returns sorted [start,end,match] tuples for each pattern', () => {
    const matches = findJinja2Matches('{{ a }} mid {% if b %} end');
    // Two matches; order between patterns is not guaranteed before our caller sorts.
    matches.sort((m1, m2) => m1.start - m2.start);
    expect(matches).toEqual([
      { start: 0, end: 7, match: '{{ a }}' },
      { start: 12, end: 22, match: '{% if b %}' },
    ]);
  });

  it('returns [] for text without Jinja syntax', () => {
    expect(findJinja2Matches('plain text')).toEqual([]);
  });
});

describe('containsJinja2InRenderedContent', () => {
  it('returns false for null containers', () => {
    expect(containsJinja2InRenderedContent(null)).toBe(false);
  });

  it('detects Jinja syntax anywhere in the container text', () => {
    const div = document.createElement('div');
    div.innerHTML = '<p>Hello {{ name }}</p>';
    expect(containsJinja2InRenderedContent(div)).toBe(true);
  });

  it('returns false when no Jinja syntax is present', () => {
    const div = document.createElement('div');
    div.innerHTML = '<p>Hello world</p>';
    expect(containsJinja2InRenderedContent(div)).toBe(false);
  });
});

describe('initializeJinja2InRenderedContent', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('is a no-op for null', () => {
    expect(() => initializeJinja2InRenderedContent(null)).not.toThrow();
  });

  it('wraps a {{ var }} match in <code class="jinja2-syntax">', () => {
    container.innerHTML = '<p>Hello {{ name }}!</p>';
    initializeJinja2InRenderedContent(container);
    const code = container.querySelector('code');
    expect(code).not.toBeNull();
    expect(code!.classList.contains(JINJA2_ATTRIBUTES.CLASS)).toBe(true);
    expect(code!.textContent).toBe('{{ name }}');
    // Surrounding text is preserved
    expect(container.querySelector('p')!.textContent).toBe('Hello {{ name }}!');
  });

  it('wraps multiple matches in one text node without index drift', () => {
    container.innerHTML = '<p>{{ a }} and {% if b %} and {{ c }}</p>';
    initializeJinja2InRenderedContent(container);
    const codes = container.querySelectorAll('code');
    expect(codes).toHaveLength(3);
    expect(codes[0].textContent).toBe('{{ a }}');
    expect(codes[1].textContent).toBe('{% if b %}');
    expect(codes[2].textContent).toBe('{{ c }}');
  });

  it('does not wrap Jinja syntax inside <code> or <pre>', () => {
    container.innerHTML = '<pre><code>{{ untouched }}</code></pre>';
    initializeJinja2InRenderedContent(container);
    // Should still be only one <code> (the original) — no extra jinja2-syntax inserted
    expect(container.querySelectorAll(`code.${JINJA2_ATTRIBUTES.CLASS}`)).toHaveLength(0);
  });

  it('skips text inside an enhanced-code-block-wrapper', () => {
    container.innerHTML =
      '<div class="enhanced-code-block-wrapper"><span>{{ untouched }}</span></div>';
    initializeJinja2InRenderedContent(container);
    expect(container.querySelectorAll(`code.${JINJA2_ATTRIBUTES.CLASS}`)).toHaveLength(0);
  });

  it('hides paragraphs that contain only {% %} control syntax', () => {
    container.innerHTML = '<p>{% if x %}</p>';
    initializeJinja2InRenderedContent(container);
    const p = container.querySelector('p')!;
    expect(p.style.display).toBe('none');
  });

  it('does NOT hide paragraphs that mix control syntax with other content', () => {
    container.innerHTML = '<p>{% if x %} hello</p>';
    initializeJinja2InRenderedContent(container);
    const p = container.querySelector('p')!;
    expect(p.style.display).toBe('');
  });

  it('does NOT hide a paragraph that contains only a {{ }} output (not control)', () => {
    container.innerHTML = '<p>{{ name }}</p>';
    initializeJinja2InRenderedContent(container);
    const p = container.querySelector('p')!;
    expect(p.style.display).toBe('');
  });
});
