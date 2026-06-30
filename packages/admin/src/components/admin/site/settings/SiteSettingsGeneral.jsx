import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { LoadingOverlay, MultiSelect, Select, TagsInput, Text } from '@mantine/core';
import { IconCode, IconLanguage, IconNews, IconWorld } from '@tabler/icons-react';
import Editor from 'react-simple-code-editor';
import { highlight, languages as prismLanguages } from 'prismjs/components/prism-core';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-jsx';
import 'prismjs/themes/prism.css';
import H2 from '../../../../common/ui/H2.jsx';
import NumberInput from '../../../../common/ui/NumberInput.jsx';
import Switch from '../../../../common/ui/Switch.jsx';
import TextInput from '../../../../common/ui/TextInput.jsx';
import useModel from '../../../../common/api/useModel.jsx';
import SiteSettingsSection from './SiteSettingsSection.jsx';
import DeleteSiteSection from './DeleteSiteSection.jsx';

export default function SiteSettingsGeneral() {
  const { t } = useTranslation();
  const { data: locales, loading: localesLoading } = useModel('locale', {
    autoFetch: true,
    pageSize: null,
  });

  const localeOptions = useMemo(
    () =>
      (locales || []).map((locale) => ({
        value: locale.id.toString(),
        label: locale.name,
      })),
    [locales],
  );

  return (
    <SiteSettingsSection
      title={t('General')}
      extraLoading={localesLoading}
      onSubmit={async ({ record, update }) => {
        let payload = { ...record };
        if (
          record.default_language_id &&
          record.available_languages &&
          !record.available_languages.some((lang) => lang.id === record.default_language_id)
        ) {
          const defaultLocale = locales?.find((l) => l.id === record.default_language_id);
          if (defaultLocale) {
            payload = {
              ...payload,
              available_languages: [
                ...record.available_languages,
                {
                  id: defaultLocale.id,
                  name: defaultLocale.name,
                  iso_code: defaultLocale.iso_code,
                },
              ],
            };
          }
        }
        await update(payload);
        window.location.reload();
      }}
    >
      {({ record, setRecord, organizationId }) => (
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <IconWorld size={16} className="text-gray-600" />
              <H2>{t('Basic Information')}</H2>
            </div>

            <TextInput
              label={t('Website Name')}
              description={t('The name of your website')}
              placeholder={t('Enter website name')}
              value={record.name || ''}
              onChange={(e) =>
                setRecord({
                  ...record,
                  name: e.target.value,
                })
              }
              required
              className="mb-4"
            />

            <TagsInput
              label={t('Domains')}
              description={t(
                'Enter the domains for this website (e.g., example.com, subdomain.example.com). Use * for wildcard (catch-all). Press Enter to add each domain.',
              )}
              placeholder={t('Enter domain and press Enter')}
              value={record.domains || ['*']}
              onChange={(domains) =>
                setRecord({
                  ...record,
                  domains: domains.length > 0 ? domains : [],
                })
              }
              className="mb-4"
              required
              clearable
              splitChars={[',', ' ']}
              maxDropdownHeight={200}
              size="md"
              radius="md"
            />
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <IconLanguage size={16} className="text-gray-600" />
              <H2>{t('Languages')}</H2>
            </div>

            <div className="relative flex flex-col gap-4">
              <LoadingOverlay visible={localesLoading} />

              <MultiSelect
                label={t('Available Languages')}
                description={t(
                  'Select languages that will be available on your site. A language switcher is only visible if your theme supports it.',
                )}
                placeholder={t('Select languages')}
                data={localeOptions}
                value={record?.available_languages?.map((lang) => lang.id.toString()) || []}
                onChange={(selectedValues) => {
                  const selectedLanguages = selectedValues
                    .map((id) => {
                      const localeId = parseInt(id);
                      const locale = locales?.find((l) => l.id === localeId);
                      return locale
                        ? {
                            id: locale.id,
                            name: locale.name,
                            iso_code: locale.iso_code,
                          }
                        : null;
                    })
                    .filter(Boolean);
                  setRecord({
                    ...record,
                    available_languages: selectedLanguages,
                  });
                }}
                className="mb-4"
                required
                searchable
                clearable
                size="md"
                radius="md"
              />

              <Select
                label={t('Default Language')}
                description={t('The default language for your site')}
                placeholder={t('Select default language')}
                data={localeOptions}
                value={record?.default_language_id?.toString() || ''}
                onChange={(value) =>
                  setRecord({
                    ...record,
                    default_language_id: value ? parseInt(value) : null,
                  })
                }
                className="mb-4"
                required
                searchable
                clearable
                size="md"
                radius="md"
              />
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <IconNews size={16} className="text-gray-600" />
              <H2>{t('Blog Settings')}</H2>
            </div>

            <NumberInput
              label={t('Posts per page')}
              description={t(
                'Number of blog posts to display per page. Only applied if your theme supports pagination.',
              )}
              value={record.blog_posts_per_page || 6}
              onChange={(value) =>
                setRecord({
                  ...record,
                  blog_posts_per_page: value,
                })
              }
              className="mb-2 max-w-[300px]"
            />
            <Switch
              label={t('Show Author on Posts')}
              description={t(
                'Display the author name on blog posts. Only visible if your theme supports it.',
              )}
              checked={record.show_post_author || false}
              onChange={(event) =>
                setRecord({
                  ...record,
                  show_post_author: event.currentTarget.checked,
                })
              }
              className="mb-2"
            />
            <Switch
              label={t('Show Published Date')}
              description={t(
                'Display the publication date on blog posts. Only visible if your theme supports it.',
              )}
              checked={record.show_post_date || false}
              onChange={(event) =>
                setRecord({
                  ...record,
                  show_post_date: event.currentTarget.checked,
                })
              }
              className="mb-2"
            />
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <IconCode size={16} className="text-gray-600" />
              <H2>{t('Custom Code')}</H2>
            </div>

            <Text c="dimmed" size="sm">
              {t(
                'Inject custom code (HTML, CSS, or JavaScript) on every page, inserted before the closing </body> tag. Only applied if your theme supports it.',
              )}
            </Text>

            <div className="border border-gray-300 rounded" style={{ height: '200px' }}>
              <Editor
                className="w-full h-full rounded shadow"
                value={record.website_custom_code || ''}
                onValueChange={(code) =>
                  setRecord({
                    ...record,
                    website_custom_code: code,
                  })
                }
                highlight={(code) => highlight(code, prismLanguages.markup, 'html')}
                padding={10}
                style={{
                  fontSize: 12,
                  backgroundColor: '#f6f8fa',
                  minHeight: '200px',
                }}
                placeholder="<!-- Enter HTML, CSS, or JavaScript code here -->"
              />
            </div>
          </div>

          <DeleteSiteSection record={record} organizationId={organizationId} />
        </div>
      )}
    </SiteSettingsSection>
  );
}
