import React from 'react';
import { useTranslation } from 'react-i18next';
import { Drawer, Accordion } from '@mantine/core';
import Switch from '../../../../common/ui/Switch.jsx';
import SeoMetadataForm from '../../../../common/ui/SeoMetadata/SeoMetadataForm.jsx';
import H2 from '../../../../common/ui/H2.jsx';
import SlugInput from './SlugInput.jsx';
import HomepageSwitch from './HomepageSwitch.jsx';
import Editor from 'react-simple-code-editor';
import { highlight, languages } from 'prismjs/components/prism-core';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-jsx';
import 'prismjs/themes/prism.css';

/**
 * Seo metadata form modal
 *
 * @type {React.ForwardRefExoticComponent<
 * React.PropsWithoutRef<{
 *   readonly pageContent: PageContent
 *   readonly updateContentField: (contentId: number, filed: string, newValue) => void
 *   readonly opened: boolean
 *   readonly onClose: () => void
 * }> &
 * React.RefAttributes<{unknow}>>}
 */
const PageContentSettingDrawer = React.forwardRef(
  (
    { pageContent, updateContentField, opened, onClose, page, setPage, updatePageField, themeName },
    ref,
  ) => {
    // Translation
    const { t } = useTranslation();

    /**
     * Handle ref
     */
    React.useImperativeHandle(ref, () => ({
      // Not thing yet
    }));

    return (
      <>
        <Drawer
          opened={opened}
          onClose={onClose}
          size="md"
          position="right"
          transitionProps={{ transition: 'slide-left', duration: 200 }}
        >
          <Accordion
            defaultValue="page-settings"
            variant="unstyled"
            radius="md"
            classNames={{ control: 'px-0', content: 'px-0' }}
          >
            <Accordion.Item value="page-settings">
              <Accordion.Control>
                <H2>{t('Page settings')}</H2>
              </Accordion.Control>
              <Accordion.Panel>
                <div className="space-y-4">
                  <HomepageSwitch page={page} setPage={setPage} />

                  <Switch
                    checked={page?.require_login || false}
                    size="lg"
                    label={t('Require Login')}
                    description={t('When enabled, users must be logged in to view this page')}
                    onChange={(e) => updatePageField('require_login', e.currentTarget.checked)}
                  />

                  {!page?.is_homepage && (
                    <SlugInput
                      isHomepage={!!page?.is_homepage}
                      contentId={pageContent?._addNew ? null : pageContent?.id}
                      localeId={pageContent?.locale_id}
                      title={pageContent?.title || ''}
                      value={pageContent?.slug || ''}
                      themeName={themeName}
                      onChange={(newSlug) => {
                        updateContentField(pageContent.id, 'slug', newSlug);
                      }}
                    />
                  )}
                </div>
              </Accordion.Panel>
            </Accordion.Item>

            <Accordion.Item value="seo-settings">
              <Accordion.Control>
                <H2>{t('SEO')}</H2>
              </Accordion.Control>
              <Accordion.Panel>
                <SeoMetadataForm
                  pageContent={pageContent}
                  updateContentField={updateContentField}
                />
              </Accordion.Panel>
            </Accordion.Item>

            <Accordion.Item value="custom-code">
              <Accordion.Control>
                <H2>{t('Custom code')}</H2>
              </Accordion.Control>
              <Accordion.Panel>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('Language-specific custom code')}
                    </label>
                    <p className="text-xs text-gray-500 mb-2">
                      {t(
                        'This code will be injected only for this language version of the page, after the content.',
                      )}
                    </p>
                    <div className="border border-gray-300 rounded" style={{ height: '150px' }}>
                      <Editor
                        className="w-full h-full"
                        value={pageContent.custom_code || ''}
                        onValueChange={(code) =>
                          updateContentField(pageContent.id, 'custom_code', code)
                        }
                        highlight={(code) => highlight(code, languages.markup, 'html')}
                        padding={10}
                        style={{
                          fontSize: 12,
                          backgroundColor: '#f6f8fa',
                          minHeight: '150px',
                        }}
                        placeholder="<!-- Enter HTML, CSS, or JavaScript code here -->"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('Page custom code (all languages)')}
                    </label>
                    <p className="text-xs text-gray-500 mb-2">
                      {t(
                        'This code will be injected in all language versions of this page, after the content.',
                      )}
                    </p>
                    <div className="border border-gray-300 rounded" style={{ height: '150px' }}>
                      <Editor
                        className="w-full h-full"
                        value={page?.page_custom_code || ''}
                        onValueChange={(code) => updatePageField('page_custom_code', code)}
                        highlight={(code) => highlight(code, languages.markup, 'html')}
                        padding={10}
                        style={{
                          fontSize: 12,
                          backgroundColor: '#f6f8fa',
                          minHeight: '150px',
                        }}
                        placeholder="<!-- Enter HTML, CSS, or JavaScript code here -->"
                      />
                    </div>
                  </div>
                </div>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        </Drawer>
      </>
    );
  },
);

PageContentSettingDrawer.displayName = 'PageContentSettingDrawer';
export default PageContentSettingDrawer;
