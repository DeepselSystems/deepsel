import { useLocation } from 'react-router-dom';

// Sometimes when creating a new record, we want to prefill some data from the URL query string.
export default function usePrefillData(initialValues) {
  const queryString = new URLSearchParams(useLocation().search);
  const prefillData = queryString.get('prefill') ? JSON.parse(queryString.get('prefill')) : {};

  const mergeObjects = (initial, prefill) => {
    const result = { ...initial };
    for (const key in prefill) {
      result[key] = prefill[key];
      // if initial value is Date and prefill value is ISO date string
      // convert prefill value to Date
      if (initial[key] instanceof Date && typeof prefill[key] === 'string') {
        result[key] = new Date(prefill[key]);
      }
    }
    return result;
  };

  return mergeObjects(initialValues, prefillData);
}
