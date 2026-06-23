import React from 'react';
import Select from '../../../../common/ui/Select.jsx';
import { useTranslation } from 'react-i18next';
import useFetch from '../../../../common/api/useFetch.js';
import useEffectOnce from '../../../../common/hooks/useEffectOnce.js';

/**
 * Author selector
 *
 * @type {React.NamedExoticComponent<{
 *   readonly value?: number | null
 *   readonly onChange?: (value?: number | null) => void
 * }>}
 */
const AuthorSelector = React.memo(({ value, onChange }) => {
  // Translation
  const { t } = useTranslation();

  // Query
  const { post: fetchUsers } = useFetch('user/search', { autoFetch: false });

  // States
  const [users, setUsers] = React.useState([]);
  const [isLoading, setIsLoading] = React.useState(true);

  // Select options
  const selectOptions = React.useMemo(
    () =>
      users.map((user) => ({
        value: String(user.id),
        label: user.name ? `${user.name} (${user.email})` : user.email,
      })),
    [users],
  );

  /**
   * Use effect once to fetch users list
   */
  useEffectOnce(() => {
    setIsLoading(true);
    fetchUsers({})
      .then(({ data }) => {
        setUsers(data);
      })
      .finally(() => {
        setIsLoading(false);
      });
  });

  return (
    <Select
      isLoading={isLoading}
      disabled={isLoading}
      label={t('Author')}
      placeholder={t('Select an author')}
      data={selectOptions}
      value={value ? String(value) : value}
      onChange={(value) => onChange?.(isNaN(+value) ? value : +value)}
      onClear={() => onChange?.(null)}
      clearable
      searchable
      variant="filled"
    />
  );
});

AuthorSelector.displayName = 'AuthorSelector';
export default AuthorSelector;
