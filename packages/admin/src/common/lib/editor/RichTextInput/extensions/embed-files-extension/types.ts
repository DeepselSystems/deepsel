import type { User } from '../../../../types';

/**
 * Embed file item — stores a reference to an attachment by name.
 * Serialized to {{ attachment('attachmentName') }} Jinja syntax in the database.
 */
export interface EmbedFileItem {
  /** Matches attachment.name column — used inside {{ attachment('...') }} */
  attachmentName: string;
  /** Human-readable label displayed in the editor */
  displayName: string;
}

/**
 * Extension-level config, set via EmbedFiles.configure() in RichTextInput and
 * read back by EditorNodeView/EmbedFilesButton via utils.getEmbedFilesOptions().
 */
export interface EmbedFilesOptions {
  backendHost?: string;
  user?: User | null;
  setUser?: (user: User | null) => void;
  locale?: string;
}
