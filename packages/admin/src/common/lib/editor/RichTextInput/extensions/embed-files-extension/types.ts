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
