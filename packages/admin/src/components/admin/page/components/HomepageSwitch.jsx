import React from 'react';
import Switch from '../../../../common/ui/Switch.jsx';
import { useTranslation } from 'react-i18next';
import useFetch from '../../../../common/api/useFetch.js';
import useEffectOnce from '../../../../common/hooks/useEffectOnce.js';

/**
 * Homepage switch
 *
 * @type {React.ForwardRefExoticComponent<
 * React.PropsWithoutRef<{
 * readonly page?: Object,
 * readonly setPage?: React.Dispatch<React.SetStateAction<Object>>
 * }> &
 * React.RefAttributes<unknown>>}
 */
const HomepageSwitch = React.forwardRef(({ page, setPage }, ref) => {
  // Translation
  const { t } = useTranslation();

  // Current homepage state
  const [currentHomepage, setCurrentHomepage] = React.useState(null);

  // Loading states
  const [isCurrentHomepageLoading, setIsCurrentHomageLoading] = React.useState(true);
  const [hasError, setHasError] = React.useState(false);

  // Query fetch current homepage
  const { post: getCurrentHomepage } = useFetch('page/search', {
    autoFetch: false,
    params: {},
  });

  /** @type {boolean} */
  const isDisabledSwitch = React.useMemo(() => {
    return isCurrentHomepageLoading || hasError;
  }, [hasError, isCurrentHomepageLoading]);

  /**
   * Fetch current homage
   *
   * @type {(function())|*}
   */
  const fetchCurrentHomepage = React.useCallback(() => {
    setIsCurrentHomageLoading(true);
    getCurrentHomepage({
      search: {
        AND: [
          {
            field: 'is_homepage',
            operator: '=',
            value: true,
          },
        ],
      },
    })
      .then(({ data }) => {
        setCurrentHomepage(data?.[0] || null);
      })
      .catch((error) => {
        console.error(`Can not fetch current homepage, ${error}`);
        setHasError(false);
      })
      .finally(() => {
        setIsCurrentHomageLoading(false);
      });
  }, [getCurrentHomepage]);

  /**
   * Handle ref
   */
  React.useImperativeHandle(ref, () => ({}));

  /**
   * Use effect once to initialize data
   */
  useEffectOnce(() => {
    fetchCurrentHomepage();
  });

  return (
    <>
      {!!page && (
        <>
          <Switch
            size="lg"
            disabled={isDisabledSwitch}
            label={t('Homepage')}
            description={t('Set this page as the homepage')}
            checked={!!page.is_homepage}
            onChange={({ currentTarget: { checked } }) =>
              setPage((prevState) => ({
                ...prevState,
                is_homepage: checked,
              }))
            }
          />
          {currentHomepage && currentHomepage.id !== page?.id && page?.is_homepage && (
            <div className="text-xs text-orange-600 mt-1">
              {t('The current homepage will be replaced and its slug auto-updated.')}
            </div>
          )}
        </>
      )}
    </>
  );
});

HomepageSwitch.displayName = 'HomepageSwitch';
export default HomepageSwitch;
