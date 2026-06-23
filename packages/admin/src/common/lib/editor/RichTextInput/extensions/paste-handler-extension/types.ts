import type { NotifyFn } from '../../../../types';

/**
 * Paste handler options interface.
 * These options are passed via PasteHandler.configure({...}) in RichTextInput.
 */
export interface PasteHandlerOptions {
  enabled?: boolean;
  onPaste?: ((files: File[]) => void) | null;
  HTMLAttributes?: Record<string, unknown>;
  /** Backend API host URL for file uploads */
  backendHost: string;
  /** JWT authentication token for API requests */
  token: string | undefined;
  /**
   * Organization id used for the `X-Organization-Id` header on uploads.
   * Pass from the consuming app's `OrganizationIdState` store.
   */
  organizationId?: number | null;
  /**
   * Callback to display toast/snackbar notifications after upload.
   * Sourced from the consuming app's notification store
   * (e.g. `NotificationState.getState().notify`).
   */
  notify?: NotifyFn;
  /**
   * ISO code of the active editor locale (e.g. "en", "fr", "it").
   * When provided, pasted images are inserted via getAttachmentByNameRelativeUrl
   * so the URL resolves to the locale-specific version of the attachment.
   */
  locale?: string;
  /**
   * Database ID of the active editor locale.
   * When provided, passed as locale_id query param on paste-upload so the
   * created AttachmentLocaleVersion is linked to the correct locale.
   */
  currentLocaleId?: number | null;
}
