/**
 * Cookie expiration in days when not specified
 */
const COOKIE_DEFAULT_EXPIRY_DAYS = 30;

/**
 * Sets a cookie with the given name, value, and expiration days
 */
export function setCookie(name: string, value: string, days = COOKIE_DEFAULT_EXPIRY_DAYS): void {
  if (typeof document !== 'undefined') {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + days);
    document.cookie = `${name}=${value}; expires=${expiryDate.toUTCString()}; path=/; SameSite=Lax`;
  }
}

/**
 * Gets a cookie value by name
 */
export function getCookie(name: string): string | null {
  if (typeof document !== 'undefined') {
    const nameEQ = name + '=';
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
      let c = ca[i];
      while (c.charAt(0) === ' ') c = c.substring(1, c.length);
      if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
    }
  }
  return null;
}

/**
 * Removes a cookie by name
 */
export function removeCookie(name: string): void {
  if (typeof document !== 'undefined') {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
  }
}
