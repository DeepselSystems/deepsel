import React from 'react';
import TextInput from '../../../../../common/ui/TextInput.jsx';
import { useTranslation } from 'react-i18next';
import useFetch from '../../../../../common/api/useFetch.js';
import { useDebouncedCallback } from '@mantine/hooks';
import { generateSlugFromStr } from '../../../../../common/utils/index.js';

/**
 * Slug input with suggestion for form content
 *
 * @type {React.ForwardRefExoticComponent<React.PropsWithoutRef<{
 *   readonly contentId?: number,
 *   readonly localeId: number,
 *   readonly title: string,
 *   readonly value: string,
 *   readonly onChange: (value: string) => void
 * }> & React.RefAttributes<unknown>>}
 */
const FormContentSlugInput = React.forwardRef(
  ({ contentId, localeId, title, value, onChange = () => {} }, ref) => {
    // Translation
    const { t } = useTranslation();

    // Query to generate slug
    const { post: generateSlug } = useFetch('form_content/generate-slug', {
      autoFetch: false,
    });
    const { post: getSlugValidation } = useFetch('form_content/validate-slug', {
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
          form_content_id: contentId,
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
        form_content_id: contentId,
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
        if (!contentId && !hasEditedSlug && title && localeId) {
          fetchSuggestionSlug();
        }
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [contentId, hasEditedSlug, localeId, title],
    );

    return (
      <>
        <TextInput
          required
          ref={ref}
          label={t('Language-specific slug')}
          placeholder={t('Enter URL slug for this language')}
          description={t(
            'URL path for this language version. Will be auto-generated from title if left empty.',
          )}
          value={value || ''}
          onChange={({ target: { value } }) => handleSlugChange(value)}
          error={
            !!validationSlug &&
            !validationSlug.is_valid &&
            t('This slug is already in use on "{{title}}"!', {
              title: validationSlug.conflicting_form_content?.title,
            })
          }
        />
      </>
    );
  },
);

FormContentSlugInput.displayName = 'FormContentSlugInput';
export default FormContentSlugInput;
