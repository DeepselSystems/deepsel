import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getFlagUrl } from '@deepsel/cms-utils/flags';
import fromPairs from 'lodash/fromPairs';
import head from 'lodash/head';
import clsx from 'clsx';
import { Tabs, Menu, Tooltip } from '@mantine/core';
import { modals } from '@mantine/modals';
import { useTranslation } from 'react-i18next';
import TextInput from '../../../common/ui/TextInput.jsx';
import FormFieldsBuilder from './components/FormFieldsBuilder/index.jsx';
import { useElementSize } from '@mantine/hooks';
import FormFieldsPreview from './components/FormFieldsPreview/index.jsx';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGear, faPlus, faSave, faStickyNote, faTrash } from '@fortawesome/free-solid-svg-icons';
import { Box } from '@mantine/core';
import LanguageSelectorModal from './components/LanguageSelectorModal/index.jsx';
import Button from '../../../common/ui/Button.jsx';
import Switch from '../../../common/ui/Switch.jsx';
import useFetch from '../../../common/api/useFetch.js';
import { useParams } from 'react-router-dom';
import useEffectOnce from '../../../common/hooks/useEffectOnce.js';
import NotificationState from '../../../common/stores/NotificationState.js';
import OrganizationIdState from '../../../common/stores/OrganizationIdState.js';
import useBackWithRedirect from '../../../common/hooks/useBackWithRedirect.js';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-jsx';
import 'prismjs/themes/prism.css';
import SettingDrawer from './components/SettingDrawer/index.jsx';
import SitePublicSettingsState from '../../../common/stores/SitePublicSettingsState.js';

const FormUpsert = () => {
  const { id } = useParams();
  const { t } = useTranslation();
  const backWithRedirect = useBackWithRedirect();
  const { notify } = NotificationState((state) => state);
  const [loading, setLoading] = useState(false);
  const { organizationId } = OrganizationIdState();
  const [settingDrawerOpened, setSettingDrawerOpened] = useState(false);

  // Get the default language ID from site settings
  const { settings: siteSettings } = SitePublicSettingsState();

  // Locale query
  const { post: getLocales } = useFetch('locale/search', { autoFetch: false });
  const [locales, setLocales] = useState(/**@type {Array<Locale>}*/ []);

  /** @type {Locale || null} */
  const defaultLocale = useMemo(
    () =>
      siteSettings.default_language ||
      head(siteSettings.available_languages) ||
      head(locales) ||
      null,
    [locales, siteSettings.available_languages, siteSettings.default_language],
  );

  // Form query
  const {
    get: getForm,
    post: createForm,
    put: updateForm,
  } = useFetch(id ? `form/${id}` : 'form', {
    autoFetch: false,
  });

  // Element sizes
  const { ref: tabsListRef, ...tabsListSize } = useElementSize();
  const { ref: actionBarRef, ...actionBarSize } = useElementSize();

  // Modals ref
  const languageSelectorModalRef = useRef({
    open: () => {},
  });
  const settingDrawerRef = useRef({
    open: () => {},
  });

  // Form fields state
  const [form, setForm] = useState(
    /**@type {Form | null}*/ {
      contents: [],
      published: true,
      form_custom_code: '',
    },
  );

  // Selected localedId (as well as the select form content)
  const [selectedLocaleId, setSelectedLocaledId] = useState(/**@type {string|null}*/ null);

  // Form content map with localeId
  const [formContentsMap, setFormContentMap] = useState(
    /**@type {Record<number, FormContent>}*/ fromPairs(
      form?.contents?.map((content) => [content.locale_id, content]),
    ),
  );

  /**
   * Handle add new form content
   *
   * @type {(localeId: number, locale: Locale) => void}
   */
  const handleAddNewFormContent = useCallback((localeId, locale) => {
    setFormContentMap((prevState) => ({
      ...prevState,
      [localeId]: {
        ...(prevState[localeId] || {}),
        fields: prevState[localeId]?.fields || [],
        locale_id: localeId,
        locale,
        custom_code: '',
        show_remaining_submissions: true,
        max_submissions: null,
        enable_submitter_email_notifications: false,
        enable_edit_submission: false,
        enable_admin_email_notifications: false,
        notification_admin_emails: [],
        enable_public_statistics: false,
      },
    }));
    setSelectedLocaledId(localeId);
  }, []);

  /**
   * Remove a form content language from state
   *
   * @type {(function(localeId))|*}
   */
  const confirmDeleteFormContent = useCallback((localeId) => {
    setFormContentMap((prevState) => {
      const newState = { ...prevState };
      delete newState[localeId];
      return newState;
    });
  }, []);

  /**
   * Handle delete form content — asks for confirmation before removing
   *
   * @type {(function(localeId))|*}
   */
  const handleDeleteFormContent = useCallback(
    (localeId) => {
      modals.openConfirmModal({
        title: t('Delete content'),
        centered: true,
        children: t('Are you sure you want to delete this content?'),
        labels: { confirm: t('Delete'), cancel: t('Cancel') },
        onConfirm: () => confirmDeleteFormContent(localeId),
        onCancel: () => {},
      });
    },
    [t, confirmDeleteFormContent],
  );

  /**
   * Validate form content
   * @param {Object} content - Form content to validate
   * @returns {{isValid: boolean, errors: Object}} - Validation result
   */
  const validateFormContent = useCallback(
    (content) => {
      const errors = {};
      let isValid = true;

      if (!content.title || !content.title.trim()) {
        errors.title = t('Form title is required');
        isValid = false;
      }

      if (!content.slug || !content.slug.trim()) {
        errors.slug = t('Form slug is required');
        isValid = false;
      } else if (!/^\/?[a-z0-9-]+(?:\/[a-z0-9-]+)*$/.test(content.slug)) {
        errors.slug = t(
          'Slug must start with a forward slash (/) and can only contain lowercase letters, numbers, and hyphens',
        );
        isValid = false;
      }

      if (!content.fields || content.fields.length === 0) {
        errors.fields = t('At least one field is required');
        isValid = false;
      } else {
        // Validate each field
        const fieldErrors = [];
        content.fields.forEach((field, index) => {
          const fieldError = {};
          let hasError = false;

          if (!field.label || !field.label.trim()) {
            fieldError.label = t('Field label is required');
            hasError = true;
          }

          if (hasError) {
            fieldErrors[index] = fieldError;
          }
        });

        if (fieldErrors.length > 0) {
          errors.fields = fieldErrors;
          isValid = false;
        }
      }

      return { isValid, errors };
    },
    [t],
  );

  /**
   * Handle submit with validation
   */
  const handleSubmit = useCallback(() => {
    // Reset all errors first
    const updatedFormContentsMap = { ...formContentsMap };
    let hasValidationErrors = false;

    // Validate each form content
    Object.keys(updatedFormContentsMap).forEach((localeId) => {
      const content = updatedFormContentsMap[localeId];
      const { isValid, errors } = validateFormContent(content);

      if (!isValid) {
        hasValidationErrors = true;
        updatedFormContentsMap[localeId] = {
          ...content,
          _errors: errors,
        };
      } else if (content._errors) {
        // Remove errors if validation passes
        const { ...cleanContent } = content;
        updatedFormContentsMap[localeId] = cleanContent;
      }
    });

    if (hasValidationErrors) {
      setFormContentMap(updatedFormContentsMap);
      notify({
        message: t('Please check all indicated errors before saving'),
        type: 'error',
      });
      return;
    }

    const payload = {
      ...form,
      contents: Object.values(updatedFormContentsMap).map((content) => ({
        ...content,
        enable_submitter_email_notifications: !!content.enable_submitter_email_notifications,
        enable_edit_submission: !!content.enable_edit_submission,
        enable_admin_email_notifications: !!content.enable_admin_email_notifications,
        max_submissions: ['', null, undefined].includes(content.max_submissions)
          ? null
          : Number(content.max_submissions),
        enable_public_statistics: !!content.enable_public_statistics,
      })),
      ...(!id && { organization_id: organizationId }),
    };

    const submitFun = id ? () => updateForm(payload) : () => createForm(payload);

    setLoading(true);
    submitFun()
      .then(() => {
        notify({
          message: t(id ? 'Form updated successfully!' : 'Form created successfully!'),
          type: 'success',
        });
        backWithRedirect();
      })
      .catch((error) => {
        console.error('Form submission error:', error);
        notify({
          message: t(error.message || 'An error occurred while saving the form'),
          type: 'error',
        });
      })
      .finally(() => {
        setLoading(false);
      });
  }, [
    formContentsMap,
    form,
    id,
    organizationId,
    validateFormContent,
    notify,
    t,
    updateForm,
    createForm,
    backWithRedirect,
  ]);

  /**
   * Detect formContentsMap and change selected locale
   */
  useEffect(() => {
    if (!formContentsMap[selectedLocaleId]) {
      setSelectedLocaledId(head(Object.keys(formContentsMap)) || null);
    }
  }, [formContentsMap, selectedLocaleId]);

  /**
   * Ensure the form always has at least one language. Fires whenever the
   * content map is empty — the initial "create form" state, or after the
   * user deletes the last remaining language — and re-adds the site's
   * default locale so the form is never left without a language.
   */
  useEffect(() => {
    if (!Object.keys(formContentsMap).length && defaultLocale) {
      handleAddNewFormContent(defaultLocale.id, defaultLocale);
    }
  }, [formContentsMap, defaultLocale, handleAddNewFormContent]);

  /**
   * Use effect once to get current data
   */
  useEffectOnce(() => {
    if (id) {
      setLoading(true);
      getForm(id)
        .then((data) => {
          setForm(data);
          setFormContentMap(
            fromPairs(data?.contents?.map((content) => [content.locale_id, content])),
          );
        })
        .finally(() => {
          setLoading(false);
        });
    }
  });

  /**
   * Use effect once to fetch all locales
   */
  useEffectOnce(() => {
    getLocales().then(({ data }) => {
      setLocales(data);
    });
  });

  return (
    <>
      <Box className="space-y-6 h-[calc(100vh-var(--app-shell-header-height)-2rem)]">
        <Tabs
          value={String(selectedLocaleId)}
          onChange={setSelectedLocaledId}
          variant="pills"
          radius="lg"
          className="!h-full"
        >
          <Box className="grid grid-cols-12 gap-4 h-full">
            <Box className="col-span-6 h-full overflow-hidden">
              <Box ref={tabsListRef}>
                <Tabs.List className="pb-6">
                  {Object.keys(formContentsMap)
                    .reverse()
                    .map((localeId, index) => (
                      <Box key={index}>
                        <Menu
                          shadow="md"
                          width={150}
                          withArrow
                          radius="md"
                          trigger="hover"
                          openDelay={100}
                          closeDelay={400}
                        >
                          <Menu.Target>
                            <Tabs.Tab value={String(localeId)}>
                              <Box className="flex gap-3">
                                <img
                                  src={getFlagUrl(formContentsMap[localeId].locale?.iso_code ?? '')}
                                  alt={formContentsMap[localeId].locale?.name ?? ''}
                                  className="h-4 w-auto rounded-sm inline-block"
                                />
                                <span>{formContentsMap[localeId].locale?.name}</span>
                              </Box>
                            </Tabs.Tab>
                          </Menu.Target>
                          <Menu.Dropdown>
                            <Menu.Item
                              leftSection={<FontAwesomeIcon icon={faTrash} />}
                              className="text-danger-main"
                              onClick={() => handleDeleteFormContent(localeId)}
                            >
                              {t('Remove')}
                            </Menu.Item>
                          </Menu.Dropdown>
                        </Menu>
                      </Box>
                    ))}

                  <Box className="flex items-center justify-center">
                    <Tooltip label={t('Add Language')}>
                      <Button
                        variant="subtle"
                        rounded="lg"
                        onClick={() => languageSelectorModalRef.current.open()}
                        className="hover:!bg-gray-200 !rounded-2xl !px-4 !py-2.5"
                      >
                        <FontAwesomeIcon icon={faPlus} />
                      </Button>
                    </Tooltip>
                  </Box>
                </Tabs.List>
              </Box>

              <Box
                style={{
                  height: `calc(100% - ${tabsListSize.height}px)`,
                }}
                className="overflow-auto space-y-4"
              >
                {Object.keys(formContentsMap).map((localeId, index) => (
                  <Tabs.Panel key={index} value={String(localeId)} className="space-y-4">
                    <TextInput
                      required
                      label={t('Form title')}
                      placeholder={t('Enter form title for this language')}
                      maxLength={255}
                      value={formContentsMap[localeId].title || ''}
                      error={formContentsMap[localeId]?._errors?.title}
                      onChange={({ target: { value } }) =>
                        setFormContentMap((prevState) => ({
                          ...prevState,
                          [localeId]: {
                            ...prevState[localeId],
                            title: value,
                            // Clear error when user starts typing
                            ...(prevState[localeId]?._errors?.title && {
                              _errors: {
                                ...prevState[localeId]._errors,
                                title: undefined,
                              },
                            }),
                          },
                        }))
                      }
                    />

                    <div>
                      <FormFieldsBuilder
                        fields={formContentsMap[localeId].fields}
                        fieldErrors={formContentsMap[localeId]?._errors?.fields}
                        setFields={(value) =>
                          setFormContentMap((prevState) => ({
                            ...prevState,
                            [localeId]: {
                              ...prevState[localeId],
                              fields: value.map((field, index) => ({
                                ...field,
                                // Clear field errors when field is updated
                                _errors: prevState[localeId]?._errors?.fields?.[index]
                                  ? undefined
                                  : field._errors,
                              })),
                              // Clear fields error when fields are added
                              ...(prevState[localeId]?._errors?.fields ===
                                t('At least one field is required') && {
                                _errors: {
                                  ...prevState[localeId]._errors,
                                  fields: undefined,
                                },
                              }),
                            },
                          }))
                        }
                      />
                      {formContentsMap[localeId]?._errors?.fields ===
                        t('At least one field is required') && (
                        <div className="mt-2 text-sm text-red-600">
                          {formContentsMap[localeId]._errors.fields}
                        </div>
                      )}
                    </div>
                  </Tabs.Panel>
                ))}
              </Box>
            </Box>

            <div
              className={clsx(
                'col-span-6',
                'min-h-[calc(100vh-var(--app-shell-header-height)-3rem)] ',
              )}
            >
              <div ref={actionBarRef} className="flex justify-end items-end gap-6 pb-6">
                <Tooltip label={t('Settings')}>
                  <Button
                    size="sm"
                    variant="subtle"
                    disabled={loading || !selectedLocaleId}
                    className="px-2"
                    onClick={() => settingDrawerRef.current.open()}
                  >
                    <FontAwesomeIcon icon={faGear} />
                  </Button>
                </Tooltip>

                <Switch
                  checked={!!form?.published}
                  onLabel={t('Published')}
                  offLabel={t('Unpublished')}
                  size="xl"
                  classNames={{
                    track: 'px-2',
                  }}
                  onChange={({ currentTarget: { checked } }) =>
                    setForm((prevState) => ({
                      ...prevState,
                      published: checked,
                    }))
                  }
                />
                <Tooltip
                  label={t('Add at least one language to this form')}
                  disabled={!!Object.keys(formContentsMap).length}
                >
                  <Button
                    size="sm"
                    leftSection={<FontAwesomeIcon icon={faSave} />}
                    loading={loading}
                    disabled={!Object.keys(formContentsMap).length}
                    onClick={handleSubmit}
                  >
                    {t('Save')}
                  </Button>
                </Tooltip>
              </div>
              <div
                className="bg-gray-zumthor border rounded shadow p-6 overflow-auto"
                style={{
                  height: `calc(100% - ${actionBarSize.height}px)`,
                }}
              >
                {!Object.keys(formContentsMap).length && (
                  <Box className="text-gray-pale-sky h-full">
                    <Box className="text-center space-y-4 my-20">
                      <Box>
                        <FontAwesomeIcon icon={faStickyNote} size="2xl" className="rotate-180" />
                      </Box>
                      <Box>{t('Add at least one language to this form')}</Box>
                    </Box>
                  </Box>
                )}

                {Object.keys(formContentsMap).map((localeId, index) => (
                  <Tabs.Panel key={index} value={String(localeId)}>
                    {formContentsMap[localeId].title && (
                      <Box className="mb-2 text-2xl font-semibold text-center">
                        {formContentsMap[localeId].title}
                      </Box>
                    )}
                    {formContentsMap[localeId].description && (
                      <Box className="mb-4 text-gray-500 text-sm text-center">
                        {formContentsMap[localeId].description}
                      </Box>
                    )}
                    <FormFieldsPreview formContent={formContentsMap[localeId]} />
                  </Tabs.Panel>
                ))}
              </div>
            </div>
          </Box>
        </Tabs>
      </Box>

      {/*region modals*/}
      <LanguageSelectorModal
        ref={languageSelectorModalRef}
        locales={locales}
        formContents={[]}
        onAdd={handleAddNewFormContent}
      />
      <SettingDrawer
        ref={settingDrawerRef}
        localeId={selectedLocaleId}
        form={form}
        setForm={setForm}
        formContentsMap={formContentsMap}
        setFormContentMap={setFormContentMap}
        opened={settingDrawerOpened}
        setOpened={setSettingDrawerOpened}
      />
      {/*endregion modals*/}
    </>
  );
};

export default FormUpsert;
