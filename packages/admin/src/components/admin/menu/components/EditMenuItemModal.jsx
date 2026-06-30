import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Tabs, Menu, Tooltip } from '@mantine/core';
import { getFlagUrl } from '@deepsel/cms-utils/flags';
import RecordSelect from '../../../../common/ui/RecordSelect.jsx';
import Select from '../../../../common/ui/Select.jsx';
import SitePublicSettingsState from '../../../../common/stores/SitePublicSettingsState.js';
import BackendHostURLState from '../../../../common/stores/BackendHostURLState.js';
import Button from '../../../../common/ui/Button.jsx';
import TextInput from '../../../../common/ui/TextInput.jsx';
import Checkbox from '../../../../common/ui/Checkbox.jsx';
import useModel from '../../../../common/api/useModel.jsx';
import OrganizationIdState from '../../../../common/stores/OrganizationIdState.js';
import { IconDeviceFloppy, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';

const EditMenuItemModal = ({
  opened,
  onClose,
  editingItem, // null for add mode, item object for edit mode
  onSave, // callback function to handle save (create or update)
  parentId = null, // for adding child items
}) => {
  const { t } = useTranslation();
  const { settings: siteSettings } = SitePublicSettingsState((state) => state);
  const { organizationId } = OrganizationIdState();
  const { backendHost } = BackendHostURLState();

  const isEditMode = !!editingItem;

  // Internal state management
  const [translations, setTranslations] = useState({});
  const [activeTranslationTab, setActiveTranslationTab] = useState(null);
  const [addingLanguage, setAddingLanguage] = useState(false);
  const [selectedLocaleId, setSelectedLocaleId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [themeSlugs, setThemeSlugs] = useState([]);

  // Fetch locales
  const { data: locales } = useModel('locale', {
    autoFetch: true,
    pageSize: null,
  });

  // Fetch theme page slugs when modal opens
  useEffect(() => {
    if (!opened || !siteSettings?.selected_theme) {
      setThemeSlugs([]);
      return;
    }
    const fetchThemeSlugs = async () => {
      try {
        const { Preferences } = await import('@capacitor/preferences');
        const tokenResult = await Preferences.get({ key: 'token' });
        const headers = {};
        if (tokenResult?.value) headers.Authorization = `Bearer ${tokenResult.value}`;
        if (organizationId) headers['X-Organization-Id'] = String(organizationId);
        const response = await fetch(
          `${backendHost}/theme/page-slugs/${siteSettings.selected_theme}`,
          { headers },
        );
        if (!response.ok) return;
        const { slugs } = await response.json();
        setThemeSlugs(slugs || []);
      } catch (e) {
        console.error('Error fetching theme page slugs:', e);
      }
    };
    fetchThemeSlugs();
  }, [opened, siteSettings?.selected_theme, backendHost, organizationId]);

  // Fetch page_content records for the active language tab
  const { data: pageContents, get: fetchPages } = useModel('page_content', {
    autoFetch: false,
    pageSize: null,
    searchFields: ['title', 'slug'],
  });

  useEffect(() => {
    if (!activeTranslationTab) return;
    const query = {
      search: {
        AND: [
          { field: 'locale.iso_code', operator: '=', value: activeTranslationTab },
          ...(organizationId
            ? [{ field: 'page.organization_id', operator: '=', value: organizationId }]
            : []),
        ],
        OR: [],
      },
    };
    fetchPages(query);
  }, [activeTranslationTab, organizationId]);

  // Build combined page options: DB pages + theme pages
  const buildPageOptions = (isoCode) => {
    const groups = [];
    // DB pages (filtered by activeTranslationTab via useModel)
    const pageItems = (pageContents || []).map((page) => ({
      value: `page:${page.id}`,
      label: `${page.title || t('Untitled')} (${page.slug || '/'})`,
    }));
    if (pageItems.length > 0) {
      groups.push({ group: t('Pages'), items: pageItems });
    }
    // Theme pages
    const themeItems = themeSlugs.map((slug) => ({
      value: `theme:${slug}`,
      label: slug === '/' ? `/ (${t('Home')})` : slug,
    }));
    if (themeItems.length > 0) {
      groups.push({ group: t('Theme Pages'), items: themeItems });
    }
    return groups;
  };

  // Get the combined Select value from a translation
  const getSelectValue = (translation) => {
    if (!translation) return null;
    if (!translation.use_custom_url && translation.page_content_id) {
      return `page:${translation.page_content_id}`;
    }
    if (translation.use_custom_url && translation.url && themeSlugs.includes(translation.url)) {
      return `theme:${translation.url}`;
    }
    return null;
  };

  // Whether this translation links to a theme page
  const isThemePage = (translation) => {
    return translation?.use_custom_url && translation?.url && themeSlugs.includes(translation.url);
  };

  // Get default language name from locales
  const defaultLanguageName =
    locales?.find((locale) => locale.iso_code === siteSettings?.default_language?.iso_code)?.name ||
    t('Default');

  // Initialize form values when modal opens
  useEffect(() => {
    if (opened) {
      if (isEditMode && editingItem) {
        // Convert existing translations to new format
        let itemTranslations = editingItem.translations || {};

        // If editing an old-style menu item, create translation for default language
        if (
          Object.keys(itemTranslations).length === 0 &&
          siteSettings?.default_language?.iso_code
        ) {
          itemTranslations = {
            [siteSettings.default_language?.iso_code]: {
              title: editingItem.title || '',
              url: editingItem.url || '',
              page_content_id: editingItem.page_content_id || null,
              use_page_title: !!editingItem.page_content_id,
              use_custom_url: !editingItem.page_content_id,
              open_in_new_tab: editingItem.open_in_new_tab || false,
            },
          };
        }

        setTranslations(itemTranslations);

        // Set active tab to first translation or default language
        const translationKeys = Object.keys(itemTranslations);
        if (translationKeys.length > 0) {
          setActiveTranslationTab(translationKeys[0]);
        } else if (siteSettings?.default_language?.iso_code) {
          setActiveTranslationTab(siteSettings.default_language?.iso_code);
        }
      } else {
        // Reset form for add mode - initialize with default language
        setSelectedLocaleId(null);

        // Initialize with default language translation
        if (siteSettings?.default_language?.iso_code) {
          const defaultTranslations = {
            [siteSettings.default_language?.iso_code]: {
              title: '',
              url: '',
              page_content_id: null,
              use_page_title: true, // Default to true
              use_custom_url: false,
              open_in_new_tab: false,
            },
          };
          setTranslations(defaultTranslations);
          setActiveTranslationTab(siteSettings.default_language?.iso_code);
        } else {
          setTranslations({});
          setActiveTranslationTab(null);
        }
      }
    }
  }, [opened, isEditMode, editingItem, siteSettings?.default_language?.iso_code]);

  const handleDeleteTranslation = (isoCode) => {
    // Don't allow deleting the default language
    if (isoCode === siteSettings?.default_language?.iso_code) {
      return;
    }

    // Remove the translation
    const updatedTranslations = { ...translations };
    delete updatedTranslations[isoCode];
    setTranslations(updatedTranslations);

    // Switch to default language tab if we deleted the active tab
    if (activeTranslationTab === isoCode) {
      setActiveTranslationTab(
        siteSettings?.default_language?.iso_code || Object.keys(updatedTranslations)[0],
      );
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const menuItemData = {
        translations: translations,
        parent_id: isEditMode ? editingItem.parent_id : parentId,
      };

      if (isEditMode) {
        // Update existing item
        await onSave(editingItem.id, menuItemData, 'update');
      } else {
        // Add new item
        await onSave(null, menuItemData, 'create');
      }
      // Close modal after save
      onClose();
    } catch (error) {
      console.error('Error saving menu item:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <div className="font-semibold text-lg">
          {isEditMode ? t('Edit Menu Item') : t('Add Menu Item')}
        </div>
      }
      size="lg"
    >
      <div className="p-4">
        <Tabs
          value={activeTranslationTab}
          onChange={setActiveTranslationTab}
          variant="pills"
          radius="lg"
        >
          <Tabs.List className="mb-4 flex-wrap">
            {Object.entries(translations || {}).map(([isoCode, translation]) => {
              const locale = locales?.find((l) => l.iso_code === isoCode);
              const isDefaultLanguage = isoCode === siteSettings?.default_language?.iso_code;
              return (
                <div key={isoCode} className="relative group">
                  <Menu
                    shadow="md"
                    width={150}
                    position="bottom-end"
                    withArrow
                    radius="md"
                    trigger="hover"
                    openDelay={100}
                    closeDelay={400}
                  >
                    <Menu.Target>
                      <Tabs.Tab value={isoCode} className="mr-1 mb-1">
                        <img
                          src={getFlagUrl(locale?.iso_code ?? '')}
                          alt={locale?.name ?? ''}
                          className="h-4 w-auto rounded-sm inline-block mr-1"
                        />
                        {locale?.name}
                        {isDefaultLanguage && (
                          <span className="ml-1 text-xs opacity-70">({t('Default')})</span>
                        )}
                      </Tabs.Tab>
                    </Menu.Target>
                    {!isDefaultLanguage && (
                      <Menu.Dropdown>
                        <Menu.Item
                          color="red"
                          leftSection={<IconTrash size={16} />}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteTranslation(isoCode);
                          }}
                        >
                          {t('Remove')}
                        </Menu.Item>
                      </Menu.Dropdown>
                    )}
                  </Menu>
                </div>
              );
            })}

            <Tooltip label={t('Add Language')}>
              <Tabs.Tab
                value="add_new"
                onClick={(e) => {
                  e.preventDefault();
                  setAddingLanguage(true);
                }}
                className="bg-gray-100 hover:bg-gray-200"
              >
                <IconPlus size={16} />
              </Tabs.Tab>
            </Tooltip>
          </Tabs.List>

          {Object.entries(translations || {}).map(([isoCode, translation]) => {
            const locale = locales?.find((l) => l.iso_code === isoCode);

            return (
              <Tabs.Panel key={isoCode} value={isoCode}>
                <div className="space-y-4">
                  {/* Page Selection (shown when not using custom URL, or when linked to a theme page) */}
                  {(!translation.use_custom_url || isThemePage(translation)) && (
                    <Select
                      label={`${t('Select a page')} (${locale?.name})`}
                      placeholder={t('Search for a page')}
                      value={getSelectValue(translation)}
                      onChange={(val) => {
                        if (!val) {
                          // Cleared
                          setTranslations((prev) => ({
                            ...prev,
                            [isoCode]: {
                              ...prev[isoCode],
                              page_content_id: null,
                              use_custom_url: false,
                              url: '',
                            },
                          }));
                          return;
                        }
                        if (val.startsWith('page:')) {
                          const pageContentId = parseInt(val.replace('page:', ''), 10);
                          setTranslations((prev) => ({
                            ...prev,
                            [isoCode]: {
                              ...prev[isoCode],
                              page_content_id: pageContentId,
                              use_custom_url: false,
                              url: '',
                            },
                          }));
                        } else if (val.startsWith('theme:')) {
                          const slug = val.replace('theme:', '');
                          setTranslations((prev) => ({
                            ...prev,
                            [isoCode]: {
                              ...prev[isoCode],
                              page_content_id: null,
                              use_custom_url: true,
                              use_page_title: false,
                              url: slug,
                            },
                          }));
                        }
                      }}
                      data={buildPageOptions(isoCode)}
                      description={t('Select a page to link to')}
                      searchable
                      clearable
                    />
                  )}

                  {/* Manual Title Input (shown when not using page title, using custom URL, or theme page) */}
                  {(isThemePage(translation) ||
                    (translation.use_custom_url && !isThemePage(translation)) ||
                    (!translation.use_custom_url &&
                      translation.page_content_id &&
                      translation.use_page_title === false)) && (
                    <TextInput
                      label={`${t('Menu Title')} (${locale?.name})`}
                      placeholder={t('Enter custom menu title')}
                      value={translation.title || ''}
                      onChange={(e) => {
                        setTranslations((prev) => ({
                          ...prev,
                          [isoCode]: {
                            ...prev[isoCode],
                            title: e.target.value,
                          },
                        }));
                      }}
                      required
                    />
                  )}

                  {/* Custom URL Input (shown when using custom URL but NOT a theme page) */}
                  {translation.use_custom_url && !isThemePage(translation) && (
                    <TextInput
                      label={`${t('Custom URL')} (${locale?.name})`}
                      placeholder={t('Enter custom URL or leave blank for no link')}
                      value={translation.url || ''}
                      onChange={(e) => {
                        setTranslations((prev) => ({
                          ...prev,
                          [isoCode]: {
                            ...prev[isoCode],
                            url: e.target.value,
                          },
                        }));
                      }}
                      description={t('Enter the URL this menu item should link to')}
                    />
                  )}

                  {/* Use Page Title Checkbox (only shown when DB page is selected) */}
                  {!translation.use_custom_url && translation.page_content_id && (
                    <Checkbox
                      checked={translation.use_page_title !== false}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setTranslations((prev) => ({
                          ...prev,
                          [isoCode]: {
                            ...prev[isoCode],
                            use_page_title: checked,
                          },
                        }));
                      }}
                      label={t('Use page title as menu title')}
                      description={t("When enabled, the menu will use the selected page's title")}
                    />
                  )}

                  {/* Use Custom URL Checkbox (hidden when theme page is selected) */}
                  {!isThemePage(translation) && (
                    <Checkbox
                      checked={(translation.use_custom_url && !isThemePage(translation)) || false}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setTranslations((prev) => ({
                          ...prev,
                          [isoCode]: {
                            ...prev[isoCode],
                            use_custom_url: checked,
                            page_content_id: checked ? null : prev[isoCode]?.page_content_id,
                            url: checked ? prev[isoCode]?.url || '' : '',
                          },
                        }));
                      }}
                      label={t('Use custom URL')}
                      description={t('Enable to enter a custom URL instead of selecting a page')}
                    />
                  )}

                  {/* Open in New Tab Checkbox (per translation) */}
                  <Checkbox
                    checked={translation.open_in_new_tab || false}
                    onChange={(e) => {
                      setTranslations((prev) => ({
                        ...prev,
                        [isoCode]: {
                          ...prev[isoCode],
                          open_in_new_tab: e.target.checked,
                        },
                      }));
                    }}
                    label={`${t('Open in new tab')} (${locale?.name})`}
                    description={t('Apply to this language only')}
                  />
                </div>
              </Tabs.Panel>
            );
          })}
        </Tabs>

        {/* Add Language Modal */}
        {addingLanguage && (
          <Modal
            opened={addingLanguage}
            onClose={() => setAddingLanguage(false)}
            title={t('Add Language Translation')}
            size="md"
          >
            <div className="space-y-4">
              <RecordSelect
                model="locale"
                displayField="name"
                pageSize={1000}
                searchFields={['name', 'iso_code']}
                label={t('Language')}
                placeholder={t('Select a Language')}
                value={selectedLocaleId}
                onChange={(localeId) => {
                  setSelectedLocaleId(localeId);
                }}
                renderOption={(option) => (
                  <span>
                    <img
                      src={getFlagUrl(option.iso_code)}
                      alt={option.name}
                      className="h-4 w-auto rounded-sm inline-block"
                    />{' '}
                    {option.name}
                  </span>
                )}
                filters={[
                  {
                    field: 'id',
                    operator: 'not_in',
                    value: [
                      // Filter out languages that already have translations
                      ...Object.keys(translations || {})
                        .map((isoCode) => locales?.find((l) => l.iso_code === isoCode)?.id)
                        .filter(Boolean),
                    ].filter(Boolean),
                  },
                ]}
                className="mb-4"
              />

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setAddingLanguage(false);
                    setSelectedLocaleId(null);
                  }}
                >
                  {t('Cancel')}
                </Button>
                <Button
                  onClick={() => {
                    const locale = locales?.find((l) => l.id === selectedLocaleId);
                    if (locale) {
                      setTranslations({
                        ...translations,
                        [locale.iso_code]: {
                          title: '',
                          url: '',
                          page_content_id: null,
                          use_page_title: true,
                          use_custom_url: false,
                          open_in_new_tab: false,
                        },
                      });
                      setActiveTranslationTab(locale.iso_code);
                      setAddingLanguage(false);
                      setSelectedLocaleId(null);
                    }
                  }}
                  disabled={!selectedLocaleId}
                  leftSection={<IconPlus size={16} />}
                >
                  {t('Add Translation')}
                </Button>
              </div>
            </div>
          </Modal>
        )}

        {/* Modal Actions */}
        <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button
            onClick={handleSave}
            leftSection={editingItem ? <IconPencil size={16} /> : <IconDeviceFloppy size={16} />}
            disabled={isSaving}
            loading={isSaving}
          >
            {editingItem ? t('Update') : t('Save')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default EditMenuItemModal;
