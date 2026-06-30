/**
 * Authenticated user shape.
 * Consuming app sources this from its own UserState store.
 */
export interface User {
  id: string;
  email: string;
  username?: string;
  token?: string;
  [key: string]: unknown;
}

/**
 * Raw OpenAPI 3.x schema object fetched from /openapi.json.
 * Consuming app sources this from its own APISchemaState store.
 */
export type OpenAPISchema = Record<string, unknown>;

/**
 * Notification callback type for displaying toast/snackbar messages.
 * Consuming app typically provides this from its own notification store
 * (e.g. `NotificationState.getState().notify` or via a hook).
 */
export type NotifyFn = (params: {
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
  duration?: number;
}) => void;

/**
 * Locale record as returned by the locales API.
 */
export interface Locale {
  id: number;
  name: string;
  iso_code: string;
}
