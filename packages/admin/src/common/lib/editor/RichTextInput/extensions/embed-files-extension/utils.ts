import type { Editor } from '@tiptap/core';
import type { EmbedFilesOptions } from './types';
import type { AttachmentLocaleVersion } from '../../../../ui';

/**
 * Maximum number of files allowed per embed block
 */
export const MAX_FILES_COUNT = 10;

/**
 * Attribute name used to identify embed-files nodes in HTML
 */
export const EMBED_FILES_ATTRIBUTES = {
  CONTAINER: 'data-embed-files',
} as const;

/**
 * CSS classes used by EditorNodeView for in-editor display.
 * Not present in the HTML saved to the database.
 */
export const EMBED_FILES_CLASSES = {
  WRAPPER: 'embed-files-wrapper',
  FILES_CONTAINER: 'embed-files-container',
  FILE_ITEM: 'embed-file-item',
  FILE_CONTENT: 'embed-file-content',
  FILE_ICON: 'embed-file-icon',
  FILE_LINK: 'embed-file-link',
} as const;

/**
 * Formats an attachment name into Jinja2 template syntax.
 * The backend resolves this to a locale-appropriate download link at render time.
 * @param attachmentName - The attachment.name column value (e.g. "annual-report-2024")
 */
export const formatJinjaSyntax = (attachmentName: string): string =>
  `{{ attachment('${attachmentName}') }}`;

/**
 * Reads the EmbedFiles extension's runtime options (backendHost, user, setUser, locale)
 * off the editor instance. Shared by EditorNodeView and EmbedFilesButton so both read
 * the same config set via EmbedFiles.configure() in RichTextInput.
 */
export function getEmbedFilesOptions(editor: Editor | null): EmbedFilesOptions {
  const extension = editor?.extensionManager.extensions.find((ext) => ext.name === 'embedFiles');
  return (
    (extension?.options as EmbedFilesOptions | undefined) ?? {
      backendHost: '',
      user: null,
      setUser: () => {},
      locale: undefined,
    }
  );
}

/**
 * Picks the display name of the locale version matching `locale` (ISO code).
 * Falls back to `fallback` when there's no locale, no versions, or no match for
 * that locale — mirrors the backend's locale resolution in
 * apps/cms/utils/jinja2_globals/attachment.py (_resolve_locale_version).
 */
export function resolveLocaleVersionDisplayName(
  localeVersions: AttachmentLocaleVersion[] | undefined | null,
  locale: string | undefined,
  fallback: string,
): string {
  const match = locale ? localeVersions?.find((v) => v.locale?.iso_code === locale) : undefined;
  return match?.name ?? fallback;
}
