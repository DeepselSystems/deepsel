/**
 * Utility functions for safely accessing browser APIs in an Astro environment
 */

/**
 * Checks if the code is running in a browser environment
 * @returns {boolean} True if running in a browser, false if running on the server
 */
export const isBrowser = () => {
  return typeof window !== 'undefined';
};

/**
 * Safely access window object
 * @returns {Window|null} The window object or null if running on the server
 */
export const getWindow = () => {
  return isBrowser() ? window : null;
};

/**
 * Safely access document object
 * @returns {Document|null} The document object or null if running on the server
 */
export const getDocument = () => {
  return isBrowser() ? document : null;
};

/**
 * Safely access localStorage
 * @returns {Storage|null} The localStorage object or null if running on the server
 */
export const getLocalStorage = () => {
  return isBrowser() ? window.localStorage : null;
};

/**
 * Safely access sessionStorage
 * @returns {Storage|null} The sessionStorage object or null if running on the server
 */
export const getSessionStorage = () => {
  return isBrowser() ? window.sessionStorage : null;
};
