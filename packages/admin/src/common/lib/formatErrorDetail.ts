/**
 * Normalize a FastAPI error `detail` field into a user-facing string.
 *
 * FastAPI returns:
 *   - string for HTTPException
 *   - array of {type, loc, msg, input} for 422 RequestValidationError
 *   - rarely, a plain object
 */
export function formatErrorDetail(detail: unknown): string {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (item && typeof item === 'object') {
          const rec = item as { loc?: unknown; msg?: unknown };
          const msg = typeof rec.msg === 'string' ? rec.msg : JSON.stringify(rec.msg);
          if (Array.isArray(rec.loc) && rec.loc.length > 0) {
            return `${rec.loc.join('.')}: ${msg}`;
          }
          return msg;
        }
        return typeof item === 'string' ? item : JSON.stringify(item);
      })
      .join('\n');
  }
  if (detail && typeof detail === 'object') return JSON.stringify(detail);
  return String(detail ?? 'Unknown error');
}
