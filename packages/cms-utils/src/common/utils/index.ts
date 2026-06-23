export * from './cookieUtils.js';
export * from './getDefaultBackendHost.js';
export * from './getHostname.js';
export * from './htmlDiff.js';
export * from './isObjectOrArray.js';

/**
 * Builds the full URL for an attachment file
 * @param backendHost - The backend host URL (e.g. "https://api.example.com")
 * @param name - The attachment filename
 * @returns Full URL to serve the attachment, or empty string if name is falsy
 */
export function getAttachmentUrl(backendHost: string, name: string): string {
  return name ? `${backendHost}/attachment/serve/${name}` : '';
}

/**
 * Builds the relative URL for an attachment file (no host)
 * @param name - The attachment filename (AttachmentLocaleVersionModel.name)
 * @returns Relative URL to serve the attachment, or empty string if name is falsy
 */
export function getAttachmentRelativeUrl(name: string): string {
  return name ? `/api/v1/attachment/serve/${name}` : '';
}

/**
 * Builds the relative URL for an attachment by AttachmentModel.name with optional locale (no host)
 * @param name - The attachment name (AttachmentModel.name)
 * @param locale - Optional locale ISO code (e.g. "en", "fr"); defaults to org default on the backend
 * @returns Relative URL to serve the attachment, or empty string if name is falsy
 */
export function getAttachmentByNameRelativeUrl(name: string, locale?: string): string {
  if (!name) return '';
  const base = `/api/v1/attachment/serve-by-name/${name}`;
  return locale ? `${base}?locale=${locale}` : base;
}

/**
 * Extracts the filename from an attachment serve URL
 * @param url - The attachment URL (e.g. "https://api.example.com/attachment/serve/file.png")
 * @returns The filename portion of the URL, or empty string if url is falsy
 */
export function getFileNameFromAttachUrl(url: string): string {
  return url?.substring(url.lastIndexOf('/') + 1) || '';
}

/**
 * Triggers a browser download for a file from an attachment URL
 * @param url - The attachment URL to download from
 */
export function downloadFromAttachUrl(url: string) {
  const downloadUrl = url.includes('?') ? `${url}&download=true` : `${url}?download=true`;
  fetch(downloadUrl)
    .then((response) => response.blob())
    .then((blob) => {
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.setAttribute('download', getFileNameFromAttachUrl(url));
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
    })
    .catch((error) => {
      console.error('Error downloading the file:', error);
    });
}

/**
 * Converts a string to a deterministic hex color via a simple hash
 */
export function stringToColor(string: string): string {
  let hash = 0;
  for (let i = 0; i < string.length; i++) {
    hash = string.charCodeAt(i) + ((hash << 5) - hash);
  }

  let color = '#';
  for (let i = 0; i < 3; i++) {
    const value = (hash >> (i * 8)) & 0xff;
    color += `00${value.toString(16)}`.slice(-2);
  }
  return color;
}

/**
 * Returns a background color and initials string derived from a display name.
 * Suitable for use in avatar components.
 */
export function stringAvatar(name: string): { color: string; children: string } {
  const children = name.includes(' ')
    ? `${name.split(' ')[0][0]}${name.split(' ')[1][0]}`
    : (name[0] ?? '');
  return {
    color: stringToColor(name),
    children,
  };
}

/**
 * Extracts the file extension from a filename or URL
 * @param fileName - The filename or path (e.g. "photo.jpg", "/path/to/file.pdf")
 * @returns The extension without the dot (e.g. "jpg"), or empty string if none
 */
export function getFileExtension(fileName: string): string {
  return fileName?.split('.').pop() ?? '';
}

/**
 * Format file size in human-readable format
 */
export const formatFileSize = (bytes: number): string => {
  if (!bytes) return '';
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
};
