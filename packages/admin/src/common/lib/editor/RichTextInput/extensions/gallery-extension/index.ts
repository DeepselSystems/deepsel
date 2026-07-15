import { Node } from '@tiptap/core';
import type { Command } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import GalleryNodeView from './components/GalleryNodeView';

/** Gallery layout configuration */
export interface GalleryConfig {
  imagesPerRow: number;
  gap: number;
  maxWidth: number | null;
  rounded: boolean;
  /** Per-image caption, keyed by attachment name (unique per org). Populated from `attachments[].caption` on render, read back on parse. */
  captions?: Record<string, string>;
}

/** Single attachment entry inside a gallery */
export interface GalleryAttachment {
  name: string;
  alt_text?: string;
  caption?: string;
}

interface GalleryNodeAttributes {
  galleryId?: string | null;
  config: GalleryConfig;
  attachments: GalleryAttachment[];
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    gallery: {
      setGallery: (attributes: Partial<GalleryNodeAttributes>) => ReturnType;
      updateGallery: (attributes: Partial<GalleryNodeAttributes>) => ReturnType;
    };
  }
}

export interface GalleryOptions {
  backendHost?: string;
  /** ISO code of the active editor locale (e.g. "en", "fr"). Passed to getAttachmentByNameRelativeUrl. */
  locale?: string;
}

/** Default gallery layout config */
const DEFAULT_GALLERY_CONFIG: GalleryConfig = {
  imagesPerRow: 3,
  gap: 4,
  maxWidth: null,
  rounded: true,
};

/** HTML attribute on the gallery wrapper div — mirrors enhanced-image-extension pattern */
const GALLERY_CONTAINER_ATTR = 'data-gallery';

/**
 * Gallery extension for TipTap.
 * Stores gallery using the attachment() Jinja function:
 *   {{ attachment('img1', 'img2', 'img3', 'configJSON') }}
 * wrapped in <div data-gallery="true"> so the extension can identify its nodes.
 * The backend attachment() function detects multiple names and renders gallery HTML.
 */
export const Gallery = Node.create<GalleryOptions>({
  name: 'gallery',

  group: 'block',
  content: '',
  marks: '',
  selectable: true,
  draggable: true,
  isolating: true,
  atom: true,

  addOptions() {
    return {
      backendHost: undefined,
      locale: undefined,
    };
  },

  addAttributes() {
    return {
      config: { default: DEFAULT_GALLERY_CONFIG },
      attachments: { default: [] },
    };
  },

  parseHTML() {
    return [
      {
        tag: `div[${GALLERY_CONTAINER_ATTR}]`,
        getAttrs: (node) => {
          if (!(node instanceof HTMLElement)) return {};

          const text = node.textContent?.trim() || '';

          // Format: {{ attachment('img1', 'img2', 'configJSON') }}
          const attachmentMatch = text.match(/^\{\{-?\s*attachment\(([\s\S]*?)\)\s*\}\}$/);
          if (attachmentMatch) {
            try {
              const argsStr = attachmentMatch[1];
              // Extract all single-quoted string values from the args.
              const allArgs = [...argsStr.matchAll(/'([^']*)'/g)].map((m) => m[1]);

              let config: GalleryConfig = { ...DEFAULT_GALLERY_CONFIG };
              let names = allArgs;

              // Last arg is the JSON config when it starts with '{'.
              if (allArgs.length > 0 && allArgs[allArgs.length - 1].trim().startsWith('{')) {
                config = JSON.parse(allArgs[allArgs.length - 1]) as GalleryConfig;
                names = allArgs.slice(0, -1);
              }

              return {
                config,
                attachments: names.map((name) => ({
                  name,
                  alt_text: '',
                  caption: config.captions?.[name] ?? '',
                })),
              };
            } catch {
              return false;
            }
          }

          return false;
        },
      },
    ];
  },

  renderHTML({ node }) {
    const config = (node.attrs.config as GalleryConfig) || DEFAULT_GALLERY_CONFIG;
    const attachments = (node.attrs.attachments as GalleryAttachment[]) || [];

    const nameArgs = attachments.map((a) => `'${a.name}'`).join(', ');
    const captions = Object.fromEntries(
      attachments.filter((a) => a.caption).map((a) => [a.name, a.caption as string]),
    );
    // Single quotes inside caption text would otherwise terminate the Jinja
    // string literal early (and confuse the quote-delimited regex parseHTML
    // uses to read it back) — escaping them as the JSON unicode sequence for
    // an apostrophe keeps the emitted arg free of raw quotes, while
    // JSON.parse (here and the backend's json.loads) restores them transparently.
    const configJson = JSON.stringify({ ...config, captions }).replace(/'/g, '\\u0027');
    const configArg = `'${configJson}'`;

    // Emit: <div data-gallery="true">{{ attachment('img1', 'img2', 'configJSON') }}</div>
    // The data-gallery="true" wrapper lets parseHTML recognise the node on reload.
    return [
      'div',
      { [GALLERY_CONTAINER_ATTR]: 'true' },
      attachments.length ? `{{ attachment(${nameArgs}, ${configArg}) }}` : '',
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(GalleryNodeView);
  },

  addCommands() {
    return {
      setGallery:
        (attributes: Partial<GalleryNodeAttributes>): Command =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: attributes,
          });
        },
      updateGallery:
        (attributes: Partial<GalleryNodeAttributes>): Command =>
        ({ commands, editor }) => {
          if (editor.isActive(this.name)) {
            return commands.updateAttributes(this.name, attributes);
          }
          return false;
        },
    };
  },
});

export default Gallery;
