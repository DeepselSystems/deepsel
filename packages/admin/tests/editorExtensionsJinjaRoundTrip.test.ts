/**
 * Round-trip tests for the rich-text editor extensions that were refactored
 * to store attachments as Jinja {{ attachment('name', ...) }} calls instead
 * of hardcoded /attachment/serve/ URLs.
 *
 * The migration tests prove old URL-based content gets rewritten; these tests
 * prove NEW edits made in the editor save the new Jinja syntax — guarding
 * against a regression where the editor could silently revert to URL output
 * while migration tests stay green.
 */
import { describe, expect, it } from 'vitest';
import { EmbedAudio } from '../src/common/lib/editor/RichTextInput/extensions/embed-audio-extension';
import { EmbedFiles } from '../src/common/lib/editor/RichTextInput/extensions/embed-files-extension';
import { EmbedVideo } from '../src/common/lib/editor/RichTextInput/extensions/embed-video-extension';
import { EnhancedImage } from '../src/common/lib/editor/RichTextInput/extensions/enhanced-image-extension';
import { Gallery } from '../src/common/lib/editor/RichTextInput/extensions/gallery-extension';

// Helper: tiptap extensions expose their config under `.config`. renderHTML
// expects { node }, where node.attrs carries the per-instance attributes.
const renderHTML = (
  ext: { config: { renderHTML?: (ctx: { node: { attrs: Record<string, unknown> } }) => unknown } },
  attrs: Record<string, unknown>,
) => {
  if (!ext.config.renderHTML) throw new Error('extension has no renderHTML');
  return ext.config.renderHTML({ node: { attrs } });
};

// Helper: render to a string for easy substring assertions. The tiptap return
// is ['tagName', attrObj, ...children]; we only care that the third element is
// the Jinja text snippet for these extensions.
const renderText = (
  ext: { config: { renderHTML?: (ctx: { node: { attrs: Record<string, unknown> } }) => unknown } },
  attrs: Record<string, unknown>,
): string => {
  const out = renderHTML(ext, attrs) as [string, Record<string, string>, string?];
  return typeof out[2] === 'string' ? out[2] : '';
};

const parseAttrs = (
  ext: {
    config: {
      parseHTML?: () => Array<{ tag: string; getAttrs: (el: HTMLElement) => unknown }>;
    };
  },
  innerText: string,
  attrName: string,
): Record<string, unknown> | false => {
  const spec = ext.config.parseHTML?.()[0];
  if (!spec) throw new Error('extension has no parseHTML rule');
  const el = document.createElement('div');
  el.setAttribute(attrName, 'true');
  el.textContent = innerText;
  return spec.getAttrs(el) as Record<string, unknown> | false;
};

// ---------- EnhancedImage ----------

describe('EnhancedImage extension', () => {
  it('renderHTML emits a Jinja attachment() call wrapped in data-enhanced-image div', () => {
    const out = renderHTML(EnhancedImage, {
      src: 'hero',
      alignment: 'left',
      rounded: true,
      circle: false,
      inline: false,
      width: 500,
      height: 300,
      description: 'A caption',
    }) as [string, Record<string, string>, string];

    expect(out[0]).toBe('div');
    expect(out[1]['data-enhanced-image']).toBe('true');
    expect(out[2]).toContain("{{ attachment('hero', ");
    expect(out[2]).toContain('"alignment":"left"');
    expect(out[2]).toContain('"width":500');
    expect(out[2]).toContain('"height":300');
    expect(out[2]).toContain('"description":"A caption"');
    expect(out[2]).not.toContain('/attachment/serve/');
  });

  it('renderHTML omits height and description when falsy', () => {
    const txt = renderText(EnhancedImage, {
      src: 'hero',
      alignment: 'center',
      rounded: true,
      circle: false,
      inline: false,
      width: 300,
      height: null,
      description: '',
    });
    expect(txt).toContain("{{ attachment('hero',");
    expect(txt).not.toContain('"height"');
    expect(txt).not.toContain('"description"');
  });

  it('parseHTML extracts src and attrs from Jinja text', () => {
    const attrs = parseAttrs(
      EnhancedImage,
      `{{ attachment('hero', {"alignment":"left","width":500,"description":"hi"}) }}`,
      'data-enhanced-image',
    ) as Record<string, unknown>;

    expect(attrs.src).toBe('hero');
    expect(attrs.alignment).toBe('left');
    expect(attrs.width).toBe(500);
    expect(attrs.description).toBe('hi');
  });

  it('parseHTML returns false when content does not match the Jinja shape', () => {
    expect(
      parseAttrs(
        EnhancedImage,
        '<img src="/api/v1/attachment/serve/hero.jpg">',
        'data-enhanced-image',
      ),
    ).toBe(false);
  });

  it('round-trips a node through renderHTML → parseHTML preserving src and key attrs', () => {
    const original = {
      src: 'hero',
      alignment: 'right',
      rounded: false,
      circle: false,
      inline: true,
      width: 450,
      height: 250,
      description: 'A round-trip caption',
    };
    const txt = renderText(EnhancedImage, original);
    const parsed = parseAttrs(EnhancedImage, txt, 'data-enhanced-image') as Record<string, unknown>;

    expect(parsed.src).toBe(original.src);
    expect(parsed.alignment).toBe(original.alignment);
    expect(parsed.width).toBe(original.width);
    expect(parsed.height).toBe(original.height);
    expect(parsed.description).toBe(original.description);
    expect(parsed.rounded).toBe(false);
    expect(parsed.inline).toBe(true);
  });
});

// ---------- EmbedAudio ----------

describe('EmbedAudio extension', () => {
  it('renderHTML emits a Jinja attachment() call', () => {
    const out = renderHTML(EmbedAudio, { src: 'theme-song' }) as [
      string,
      Record<string, string>,
      string,
    ];
    expect(out[1]['data-embed-audio']).toBe('true');
    expect(out[2]).toBe("{{ attachment('theme-song') }}");
    expect(out[2]).not.toContain('/attachment/serve/');
  });

  it('renderHTML returns an empty div when src is missing', () => {
    expect(renderHTML(EmbedAudio, { src: null })).toEqual(['div', {}]);
  });

  it('parseHTML extracts src from the Jinja text', () => {
    const attrs = parseAttrs(
      EmbedAudio,
      `{{ attachment('theme-song') }}`,
      'data-embed-audio',
    ) as Record<string, unknown>;
    expect(attrs.src).toBe('theme-song');
  });

  it('round-trips through renderHTML → parseHTML', () => {
    const txt = renderText(EmbedAudio, { src: 'theme-song' });
    const parsed = parseAttrs(EmbedAudio, txt, 'data-embed-audio') as Record<string, unknown>;
    expect(parsed.src).toBe('theme-song');
  });
});

// ---------- EmbedVideo ----------

describe('EmbedVideo extension', () => {
  it('renderHTML emits a Jinja attachment() call', () => {
    const out = renderHTML(EmbedVideo, { src: 'intro-clip' }) as [
      string,
      Record<string, string>,
      string,
    ];
    expect(out[1]['data-embed-video']).toBe('true');
    expect(out[2]).toBe("{{ attachment('intro-clip') }}");
    expect(out[2]).not.toContain('/attachment/serve/');
  });

  it('round-trips through renderHTML → parseHTML', () => {
    const txt = renderText(EmbedVideo, { src: 'intro-clip' });
    const parsed = parseAttrs(EmbedVideo, txt, 'data-embed-video') as Record<string, unknown>;
    expect(parsed.src).toBe('intro-clip');
  });
});

// ---------- EmbedFiles ----------

describe('EmbedFiles extension', () => {
  it('renderHTML emits one Jinja attachment() call per file', () => {
    const out = renderHTML(EmbedFiles, {
      files: [
        { attachmentName: 'spec', displayName: 'spec' },
        { attachmentName: 'data', displayName: 'data' },
      ],
    }) as [string, Record<string, string>, string];
    expect(out[1]['data-embed-files']).toBe('true');
    expect(out[2]).toContain("{{ attachment('spec') }}");
    expect(out[2]).toContain("{{ attachment('data') }}");
    expect(out[2]).not.toContain('/attachment/serve/');
  });

  it('renderHTML returns empty div when files is empty or missing', () => {
    expect(renderHTML(EmbedFiles, { files: [] })).toEqual(['div', {}]);
  });

  it('parseHTML extracts multiple file names from Jinja text', () => {
    const attrs = parseAttrs(
      EmbedFiles,
      `{{ attachment('spec') }}\n{{ attachment('data') }}`,
      'data-embed-files',
    ) as Record<string, unknown>;
    const files = attrs.files as Array<{ attachmentName: string }>;
    expect(files.map((f) => f.attachmentName)).toEqual(['spec', 'data']);
  });
});

// ---------- Gallery ----------

describe('Gallery extension', () => {
  it('renderHTML emits a multi-name attachment() call with config JSON', () => {
    const out = renderHTML(Gallery, {
      attachments: [{ name: 'a' }, { name: 'b' }, { name: 'c' }],
      config: { imagesPerRow: 3, gap: 4, maxWidth: null, rounded: true },
    }) as [string, Record<string, string>, string];

    expect(out[1]['data-gallery']).toBe('true');
    expect(out[2]).toContain("{{ attachment('a', 'b', 'c',");
    expect(out[2]).toContain('"imagesPerRow":3');
    expect(out[2]).toContain('"gap":4');
    expect(out[2]).not.toContain('/attachment/serve/');
  });

  it('renderHTML emits empty body when no attachments', () => {
    const out = renderHTML(Gallery, {
      attachments: [],
      config: { imagesPerRow: 3, gap: 4, maxWidth: null, rounded: true },
    }) as [string, Record<string, string>, string];
    expect(out[2]).toBe('');
  });

  it('parseHTML extracts attachments and config from Jinja text', () => {
    const txt = `{{ attachment('a', 'b', 'c', '{"imagesPerRow":2,"gap":8,"maxWidth":null,"rounded":false}') }}`;
    const attrs = parseAttrs(Gallery, txt, 'data-gallery') as Record<string, unknown>;
    const attachments = attrs.attachments as Array<{ name: string }>;
    const config = attrs.config as { imagesPerRow: number; gap: number; rounded: boolean };

    expect(attachments.map((a) => a.name)).toEqual(['a', 'b', 'c']);
    expect(config.imagesPerRow).toBe(2);
    expect(config.gap).toBe(8);
    expect(config.rounded).toBe(false);
  });

  it('round-trips through renderHTML → parseHTML preserving names and config', () => {
    const original = {
      attachments: [{ name: 'x' }, { name: 'y' }],
      config: { imagesPerRow: 4, gap: 16, maxWidth: 800, rounded: true },
    };
    const txt = renderText(Gallery, original);
    const parsed = parseAttrs(Gallery, txt, 'data-gallery') as Record<string, unknown>;
    expect((parsed.attachments as Array<{ name: string }>).map((a) => a.name)).toEqual(['x', 'y']);
    expect(parsed.config).toEqual(original.config);
  });
});
