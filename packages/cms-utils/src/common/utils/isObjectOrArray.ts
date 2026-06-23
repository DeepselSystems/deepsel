/**
 * Returns true if value is a plain object or array (not null)
 */
export function isObjectOrArray(value: unknown): boolean {
  return (
    value !== null &&
    (Array.isArray(value) || Object.prototype.toString.call(value) === '[object Object]')
  );
}
