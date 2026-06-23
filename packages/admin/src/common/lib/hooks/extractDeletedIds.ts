type FilterCondition = {
  field: unknown;
  operator: unknown;
  value: unknown;
};

function isIdEquals(condition: unknown): condition is FilterCondition & {
  value: string | number;
} {
  if (!condition || typeof condition !== 'object') return false;
  const c = condition as FilterCondition;
  if (c.field !== 'id' || c.operator !== '=') return false;
  return typeof c.value === 'string' || typeof c.value === 'number';
}

/**
 * Extracts the list of record ids targeted by a bulkDelete query, for the
 * common shapes produced by `handleDeleteConfirm`. Returns `null` when the
 * query shape is anything else — caller should refetch in that case.
 *
 * Supported shapes:
 *   `{ OR: [{ field: 'id', operator: '=', value: X }, ...] }`
 *   `{ field: 'id', operator: '=', value: X }`
 */
export function extractDeletedIds(
  queryObject: Record<string, unknown>,
): Array<string | number> | null {
  if (!queryObject || typeof queryObject !== 'object') return null;

  if (isIdEquals(queryObject)) {
    return [queryObject.value];
  }

  const keys = Object.keys(queryObject);
  if (keys.length === 1 && keys[0] === 'OR' && Array.isArray(queryObject.OR)) {
    const conditions = queryObject.OR;
    if (conditions.length === 0) return null;
    const ids: Array<string | number> = [];
    for (const condition of conditions) {
      if (!isIdEquals(condition)) return null;
      ids.push(condition.value);
    }
    return ids;
  }

  return null;
}
