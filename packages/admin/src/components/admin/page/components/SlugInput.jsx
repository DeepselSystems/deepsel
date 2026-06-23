import React from 'react';
import TextInput from '../../../../common/ui/TextInput.jsx';
import { useTranslation } from 'react-i18next';
import useFetch from '../../../../common/api/useFetch.js';
import { useDebouncedCallback } from '@mantine/hooks';
import { generateSlugFromStr } from '../../../../common/utils/index.js';
import { HOMEPAGE_DEFAULT_SLUG } from '../../../../constants/slug.js';

/**
 * Slug input with suggestion
 *
 * @type {React.ForwardRefExoticComponent<React.PropsWithoutRef<{
 *   readonly isHomepage?: boolean,
 *   readonly contentId?: number,
 *   readonly localeId: number,
 *   readonly title: string,
 *   readonly value: string,
 *   readonly onChange: (value: string) => void,
 *   readonly themeName?: string
 * }> & React.RefAttributes<unknown>>}
 */
const SlugInput = React.forwardRef(
  (
    { contentId, localeId, title, value, onChange = () => {}, isHomepage = false, themeName },
    ref,
  ) => {
    // Translation
    const { t } = useTranslation();

    // Query to generate slug
    const { post: generateSlug } = useFetch('page_content/generate-slug', {
      autoFetch: false,
    });
    const { post: getSlugValidation } = useFetch('page_content/validate-slug', {
      autoFetch: false,
    });

    // Loading
    const [, setIsSlugLoading] = React.useState(false);
    const [, setIsCheckingValid] = React.useState(false);

    // State for checking
    const [validationSlug, setValidationSlug] = React.useState(null);

    // Whether the use did edit slug once
    const [hasEditedSlug, setHasEditedSlug] = React.useState(false);

    /**
     * Check if slug is valid
     */
    const checkValidSlug = useDebouncedCallback(async () => {
      setIsCheckingValid(true);
      try {
        const data = await getSlugValidation({
          title,
          locale_id: localeId,
          slug: value,
          page_content_id: contentId,
          theme_name: themeName || undefined,
        });
        if (value === data.slug) {
          setValidationSlug(data);
        }
        return data;
      } catch (e) {
        console.error(`Can not get slug validation info: ${e}`);
      } finally {
        setIsCheckingValid(false);
      }
    }, 500);

    /**
     * Fetch suggestion slug
     */
    const fetchSuggestionSlug = useDebouncedCallback(() => {
      setIsSlugLoading(true);
      generateSlug({
        title,
        locale_id: localeId,
        page_content_id: contentId,
      })
        .then((data) => {
          onChange(data.slug);
        })
        .catch((error) => {
          console.error(`Can not get suggestion slug: ${error}`);
        })
        .finally(() => {
          setIsSlugLoading(false);
        });
    }, 1000);

    /**
     * Handle slug changes
     * @type {(function(*): void)|*}
     */
    const handleSlugChange = React.useCallback(
      (value) => {
        const newSlug = generateSlugFromStr(value);
        setHasEditedSlug(true);
        onChange?.(newSlug);
        checkValidSlug();
      },
      [checkValidSlug, onChange],
    );

    /**
     * Handle ref
     */
    React.useImperativeHandle(ref, () => ({
      checkValidSlug,
    }));

    /**
     * Detect props change and fetch suggestion
     */
    React.useEffect(
      () => {
        if (!isHomepage && !contentId && !hasEditedSlug && title && localeId) {
          fetchSuggestionSlug();
        }
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [isHomepage, contentId, hasEditedSlug, localeId, title],
    );

    return (
      <>
        <TextInput
          ref={ref}
          disabled={isHomepage}
          label={t('Language-specific slug')}
          placeholder={t('Enter URL slug for this language')}
          description={t(
            'URL path for this language version. Will be auto-generated from title if left empty.',
          )}
          variant="filled"
          value={isHomepage ? HOMEPAGE_DEFAULT_SLUG : value}
          onChange={({ target: { value } }) => handleSlugChange(value)}
          error={
            !!validationSlug &&
            !validationSlug.is_valid &&
            (validationSlug.theme_conflict
              ? t('This slug is used by the theme file "{{file}}". Edit it in the theme editor.', {
                  file: validationSlug.theme_conflict,
                })
              : t('This slug is already in use on "{{title}}"!', {
                  title: validationSlug.conflicting_page_content?.title,
                }))
          }
        />
      </>
    );
  },
);

SlugInput.displayName = 'SlugInput';
export default SlugInput;
