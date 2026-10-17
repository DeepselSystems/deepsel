import { useEffect, useRef } from 'react';
import { getGridStringOperators } from '@mui/x-data-grid';

/**
 * Maps MUI DataGrid's native filter-panel operator names to the backend
 * search operator they should be translated to (see deepsel's Operator enum:
 * =, !=, in, not_in, between, contains, >, >=, <, <=, like, ilike).
 */
export const GRID_FILTER_OPERATOR_MAP = {
  contains: 'ilike',
  startsWith: 'ilike',
  endsWith: 'ilike',
  equals: '=',
  is: '=',
  not: '!=',
  '=': '=',
  '!=': '!=',
  '>': '>',
  '>=': '>=',
  '<': '<',
  '<=': '<=',
  after: '>',
  onOrAfter: '>=',
  before: '<',
  onOrBefore: '<=',
  isAnyOf: 'in',
};

/**
 * Restricted set of string filter operators, limited to the ones that have
 * a direct equivalent in GRID_FILTER_OPERATOR_MAP / backend Operator enum.
 * MUI's default string operators also include `doesNotContain` and
 * `doesNotEqual`, which the backend has no "not like"/"not equal" support
 * for and would otherwise be silently dropped by the filter model handler.
 */
export const GRID_FILTER_STRING_OPERATORS = getGridStringOperators().filter((operator) =>
  ['contains', 'equals', 'isAnyOf', 'isEmpty', 'isNotEmpty'].includes(operator.value),
);

/**
 * Applies GRID_FILTER_STRING_OPERATORS to every filterable column that
 * doesn't already declare its own `type` (number/boolean/date/...) or a
 * custom `filterOperators`. Meant to be applied once over a whole `columns`
 * array, e.g. `columns.map(withDefaultGridFilterOperators)`, instead of
 * repeating `filterOperators` on each column definition.
 */
export const withDefaultGridFilterOperators = (column) => {
  if (column.filterable === false || column.type || column.filterOperators) return column;
  return { ...column, filterOperators: GRID_FILTER_STRING_OPERATORS };
};

/**
 * Derives a `fieldMap` (for `useGridServerFilter`'s `fieldMap` option) from a
 * `columns` array, reading each column's own `filterField` — a custom
 * GridColDef property set on any column whose grid `field` doesn't exist
 * as-is on the backend resource (e.g. relation dot-paths, computed fields).
 * Keeps the mapping co-located with the column definition instead of in a
 * separate lookup table that has to be kept in sync by field name.
 */
export const buildGridFilterFieldMap = (columns) =>
  columns.reduce((acc, column) => {
    if (column.filterField) acc[column.field] = column.filterField;
    return acc;
  }, {});

/**
 * Builds a debounced `onFilterModelChange` handler for a MUI DataGrid running
 * in server `filterMode`, translating its native filter-panel model into
 * backend search filters compatible with `useModel`'s `filters`/`setFilters`.
 *
 * Debouncing avoids firing a request on every keystroke while a filter value
 * is still being typed in the filter panel.
 *
 * @param {object} options
 * @param {Array<{field: string, operator: string, value: any}>} options.filters - current filters (from useModel)
 * @param {Function} options.setFilters - filters setter (from useModel)
 * @param {Record<string, string>} [options.fieldMap] - maps a grid column field to the
 *   actual backend filterable field path (e.g. relation dot-paths like `contents.title`)
 * @param {number} [options.debounceMs]
 * @returns {{ handleFilterModelChange: Function }}
 */
export default function useGridServerFilter({
  filters,
  setFilters,
  fieldMap = {},
  debounceMs = 500,
}) {
  // Tracks which filter fields currently come from the DataGrid's native
  // filter panel, so a panel change replaces only those — leaving any other
  // filters (e.g. tenant scoping, filters added via a custom column-menu
  // popover) untouched.
  const gridFilterFieldsRef = useRef([]);
  const debounceTimerRef = useRef(null);

  useEffect(() => {
    return () => clearTimeout(debounceTimerRef.current);
  }, []);

  const handleFilterModelChange = (model) => {
    clearTimeout(debounceTimerRef.current);

    debounceTimerRef.current = setTimeout(() => {
      const mapped = model.items.reduce((acc, item) => {
        const field = fieldMap[item.field] ?? item.field;

        if (item.operator === 'isEmpty') {
          acc.push({ field, operator: '=', value: null });
        } else if (item.operator === 'isNotEmpty') {
          acc.push({ field, operator: '!=', value: null });
        } else {
          const operator = GRID_FILTER_OPERATOR_MAP[item.operator];
          if (operator && item.value !== undefined && item.value !== '') {
            acc.push({ field, operator, value: item.value });
          }
        }
        return acc;
      }, []);

      const keptFilters = filters.filter((f) => !gridFilterFieldsRef.current.includes(f.field));
      gridFilterFieldsRef.current = mapped.map((f) => f.field);

      setFilters([...keptFilters, ...mapped]);
    }, debounceMs);
  };

  return { handleFilterModelChange };
}
