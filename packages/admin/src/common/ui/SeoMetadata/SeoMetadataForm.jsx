import React from 'react';
import TextInput from '../TextInput.jsx';
import { useTranslation } from 'react-i18next';
import TextArea from '../TextArea.jsx';
import Switch from '../Switch.jsx';
import FileInput from '../FileInput.jsx';
/**
 * SEO metadata form
 * This form is using for both Blog-Post-Content and Page-Content
 *
 * @type {React.NamedExoticComponent<{
 * readonly pageContent: PageContent | BlogPostContent
 * readonly updateContentField: (contentId: number, filed: string, newValue) => void
 * }>}
 */
const SeoMetadataForm = React.memo(({ pageContent, updateContentField }) => {
  // Translation
  const { t } = useTranslation();

  return (
    <>
      <div className="space-y-3">
        <TextInput
          label={t('Title')}
          description={t('Defaults to associated content title')}
          size="sm"
          type="text"
          variant="filled"
          value={pageContent.seo_metadata_title || ''}
          onChange={({ target: { value } }) =>
            updateContentField?.(pageContent.id, 'seo_metadata_title', value)
          }
        />

        <TextArea
          label={t('Description')}
          description={t('Meta description for search results')}
          size="sm"
          type="text"
          variant="filled"
          value={pageContent.seo_metadata_description || ''}
          onChange={({ target: { value } }) =>
            updateContentField?.(pageContent.id, 'seo_metadata_description', value)
          }
        />

        <Switch
          classNames={{
            body: 'flex-col-reverse gap-2',
            label: 'px-0 text-sm font-medium',
            description: 'px-0 mt-0',
          }}
          label={t('Allow indexing')}
          description={t('Allow search engine indexing')}
          checked={!!pageContent.seo_metadata_allow_indexing}
          onChange={({ target: { checked } }) =>
            updateContentField?.(pageContent.id, 'seo_metadata_allow_indexing', checked)
          }
        />

        <FileInput
          label={t('Social sharing image')}
          type="image"
          locale={pageContent.locale}
          value={pageContent.seo_metadata_featured_image?.name}
          onChange={(file) => {
            updateContentField?.(pageContent.id, 'seo_metadata_featured_image', file);
            updateContentField?.(
              pageContent.id,
              'seo_metadata_featured_image_id',
              file?.id || null,
            );
          }}
        />
      </div>
    </>
  );
});

SeoMetadataForm.displayName = 'SeoMetadataForm';
export default SeoMetadataForm;
