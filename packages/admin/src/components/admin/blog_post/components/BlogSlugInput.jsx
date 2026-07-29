import React from 'react';
import TextInput from '../../../../common/ui/TextInput.jsx';
import { useTranslation } from 'react-i18next';
import useFetch from '../../../../common/api/useFetch.js';
import { useDebouncedCallback } from '@mantine/hooks';
import { generateSlugFromStr } from '../../../../common/utils/index.js';

/**
 * Slug input for blog posts, with auto-generation and duplicate validation.
 * Unlike Page's per-locale slug, a blog post's slug is a single field shared
 * across all its languages (BlogPostModel.slug) — no localeId here.
 *
 * @type {React.ForwardRefExoticComponent<React.PropsWithoutRef<{
 *   readonly blogPostId?: number,
 *   readonly title: string,
 *   readonly value: string,
 *   readonly onChange: (value: string) => void
 * }> & React.RefAttributes<unknown>>}
 */
const BlogSlugInput = React.forwardRef(({ blogPostId, title, value, onChange = () => {} }, ref) => {
  const { t } = useTranslation();

  const { post: generateSlug } = useFetch('blog_post/generate-slug', { autoFetch: false });
  const { post: getSlugValidation } = useFetch('blog_post/validate-slug', { autoFetch: false });

  const [, setIsSlugLoading] = React.useState(false);
  const [, setIsCheckingValid] = React.useState(false);
  const [validationSlug, setValidationSlug] = React.useState(null);
  const [hasEditedSlug, setHasEditedSlug] = React.useState(false);

  const checkValidSlug = useDebouncedCallback(async () => {
    setIsCheckingValid(true);
    try {
      const data = await getSlugValidation({
        slug: value,
        blog_post_id: blogPostId,
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

  const fetchSuggestionSlug = useDebouncedCallback(() => {
    setIsSlugLoading(true);
    generateSlug({ title, blog_post_id: blogPostId })
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

  const handleSlugChange = React.useCallback(
    (value) => {
      const newSlug = generateSlugFromStr(value);
      setHasEditedSlug(true);
      onChange?.(newSlug);
      checkValidSlug();
    },
    [checkValidSlug, onChange],
  );

  React.useImperativeHandle(ref, () => ({
    checkValidSlug,
  }));

  // Auto-generate (deduped server-side) from title until the user edits the
  // slug themselves, or an existing post is being loaded (blogPostId set).
  React.useEffect(
    () => {
      if (!blogPostId && !hasEditedSlug && title) {
        fetchSuggestionSlug();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [blogPostId, hasEditedSlug, title],
  );

  return (
    <TextInput
      ref={ref}
      className="w-full"
      variant="filled"
      label={t('Slug')}
      placeholder={t('Enter URL slug (required)')}
      required
      value={value}
      onChange={({ target: { value } }) => handleSlugChange(value)}
      error={!!validationSlug && !validationSlug.is_valid && t('This slug is already in use!')}
    />
  );
});

BlogSlugInput.displayName = 'BlogSlugInput';
export default BlogSlugInput;
