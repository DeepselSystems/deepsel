import { useTranslation } from 'react-i18next';
import Card from '../../../common/ui/Card.jsx';
import H1 from '../../../common/ui/H1.jsx';
import useModel from '../../../common/api/useModel.jsx';
import NotificationState from '../../../common/stores/NotificationState.js';
import OrganizationIdState from '../../../common/stores/OrganizationIdState.js';
import useOrganization from '../../../common/hooks/useOrganization.js';
import CreateFormActionBar from '../../../common/ui/CreateFormActionBar.jsx';
import { useState, useEffect } from 'react';
import {
  Alert,
  Badge,
  Card as MantineCard,
  LoadingOverlay,
  Loader,
  MultiSelect,
  SimpleGrid,
  TagsInput,
  Stepper,
  Group,
  Text,
} from '@mantine/core';
import Select from '../../../common/ui/Select.jsx';
import Button from '../../../common/ui/Button.jsx';
import TextInput from '../../../common/ui/TextInput.jsx';
import PasswordInput from '../../../common/ui/PasswordInput.jsx';
import RecordSelect from '../../../common/ui/RecordSelect.jsx';
import BackendHostURLState from '../../../common/stores/BackendHostURLState.js';
import useAuthentication from '../../../common/api/useAuthentication.js';
import { useBasename } from '../../../common/BasenameContext.js';
import {
  IconAlertTriangle,
  IconArrowRight,
  IconCheck,
  IconKey,
  IconLanguage,
  IconPalette,
  IconWorld,
} from '@tabler/icons-react';

export default function SiteCreate() {
  const { t } = useTranslation();
  const { create } = useModel('organization');
  const { notify } = NotificationState((state) => state);
  const { refresh: refreshOrganizations } = useOrganization();
  const setOrganizationId = OrganizationIdState((state) => state.setOrganizationId);
  const { organizationId: currentOrganizationId } = OrganizationIdState();
  const { backendHost } = BackendHostURLState();
  const { user } = useAuthentication();
  const basename = useBasename();
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const [themes, setThemes] = useState([]);
  const [themesLoading, setThemesLoading] = useState(true);
  const [themesError, setThemesError] = useState(null);
  const [rebuilding, setRebuilding] = useState(false);

  const [record, setRecord] = useState({
    selected_theme: null,
    name: '',
    domains: [],
    available_languages: [],
    default_language_id: null,
    openrouter_api_key: '',
    ai_translation_model_id: null,
    ai_default_writing_model_id: null,
    ai_autocomplete_model_id: null,
  });

  useEffect(() => {
    const fetchThemes = async () => {
      try {
        setThemesLoading(true);
        setThemesError(null);
        const response = await fetch(`${backendHost}/theme/list`, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${user.token}`,
            ...(currentOrganizationId
              ? { 'X-Organization-Id': String(currentOrganizationId) }
              : {}),
          },
          credentials: 'include',
        });
        if (!response.ok) {
          throw new Error(`Failed to fetch themes: ${response.statusText}`);
        }
        const data = await response.json();
        setThemes(data);
      } catch (err) {
        console.error('Error fetching themes:', err);
        setThemesError(err.message);
      } finally {
        setThemesLoading(false);
      }
    };
    fetchThemes();
  }, [backendHost, user.token, currentOrganizationId]);

  const pollBuildStatus = () => {
    return new Promise((resolve, reject) => {
      const interval = setInterval(async () => {
        try {
          const res = await fetch(`${backendHost}/theme/build-status`, {
            headers: {
              Authorization: `Bearer ${user.token}`,
              ...(currentOrganizationId
                ? { 'X-Organization-Id': String(currentOrganizationId) }
                : {}),
            },
            credentials: 'include',
          });
          if (!res.ok) {
            clearInterval(interval);
            reject(new Error('Failed to check build status'));
            return;
          }
          const status = await res.json();
          if (status.status === 'idle') {
            clearInterval(interval);
            resolve();
          } else if (status.status === 'error') {
            clearInterval(interval);
            reject(new Error(status.error || 'Build failed'));
          }
        } catch (err) {
          clearInterval(interval);
          reject(err);
        }
      }, 2000);

      setTimeout(() => {
        clearInterval(interval);
        reject(new Error('Build timed out'));
      }, 300000);
    });
  };

  const { data: locales, loading: localesLoading } = useModel('locale', {
    autoFetch: true,
    pageSize: null,
  });

  const [localeOptions, setLocaleOptions] = useState([]);

  useEffect(() => {
    if (locales) {
      const options = locales.map((locale) => ({
        value: locale.id.toString(),
        label: locale.name,
      }));
      setLocaleOptions(options);
    }
  }, [locales]);

  const handleAvailableLanguagesChange = (selectedValues) => {
    const selectedLanguages = selectedValues
      .map((id) => {
        const localeId = parseInt(id);
        const locale = locales.find((l) => l.id === localeId);
        return locale
          ? {
              id: locale.id,
              name: locale.name,
              iso_code: locale.iso_code,
            }
          : null;
      })
      .filter(Boolean);

    const stillIncludesDefault = selectedLanguages.some(
      (lang) => lang.id === record.default_language_id,
    );

    setRecord({
      ...record,
      available_languages: selectedLanguages,
      default_language_id: stillIncludesDefault ? record.default_language_id : null,
    });
  };

  const handleDefaultLanguageChange = (value) => {
    setRecord({
      ...record,
      default_language_id: value ? parseInt(value) : null,
    });
  };

  const handleDomainsChange = (domains) => {
    setRecord({
      ...record,
      domains: domains.length > 0 ? domains : [],
    });
  };

  const nextStep = () => setActive((current) => (current < 3 ? current + 1 : current));
  const prevStep = () => setActive((current) => (current > 0 ? current - 1 : current));

  async function handleSubmit() {
    try {
      setLoading(true);

      if (!record.selected_theme) {
        throw new Error(t('Please choose a theme'));
      }

      if (!record.name.trim()) {
        throw new Error(t('Name is required'));
      }

      if (record.domains.length === 0) {
        throw new Error(t('At least one domain is required'));
      }

      let payload = record;
      if (
        record.default_language_id &&
        record.available_languages &&
        !record.available_languages.some((lang) => lang.id === record.default_language_id)
      ) {
        const defaultLocale = locales.find((l) => l.id === record.default_language_id);
        if (defaultLocale) {
          payload = {
            ...record,
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

      const createdOrganization = await create(payload);

      const themeRes = await fetch(`${backendHost}/theme/select`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Organization-Id': String(createdOrganization.id),
        },
        credentials: 'include',
        body: JSON.stringify({
          folder_name: record.selected_theme,
          organization_id: createdOrganization.id,
        }),
      });
      if (!themeRes.ok) {
        const err = await themeRes.json();
        throw new Error(err.detail || t('Failed to apply theme'));
      }
      const themeData = await themeRes.json();
      if (themeData.rebuilding) {
        setRebuilding(true);
        await pollBuildStatus();
      }

      notify({
        message: t('Website created successfully!'),
        type: 'success',
      });
      await refreshOrganizations();
      if (createdOrganization?.id) {
        setOrganizationId(createdOrganization.id);
      }
      window.location.href = `${basename}/pages`;
    } catch (error) {
      console.error(error);
      notify({
        message: error.message,
        type: 'error',
      });
    } finally {
      setLoading(false);
      setRebuilding(false);
    }
  }

  return (
    <div className={`max-w-screen-xl m-auto my-[20px] px-[24px]`}>
      <CreateFormActionBar loading={loading || localesLoading} customActions={<></>} />

      {rebuilding && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 flex flex-col items-center gap-4 shadow-xl">
            <Loader size="xl" />
            <Text size="lg" fw={600}>
              {t('Rebuilding site with new theme...')}
            </Text>
            <Text size="sm" c="dimmed">
              {t('This may take a minute. Please wait.')}
            </Text>
          </div>
        </div>
      )}

      <Card className={`shadow-none border-none`}>
        <H1>{t('Create New Website')}</H1>

        <Stepper active={active} onStepClick={setActive} color="green" className="mt-6">
          <Stepper.Step
            label={t('Choose Theme')}
            description={t('Pick a starting theme')}
            icon={<IconPalette size={16} />}
            color={active === 0 ? 'blue' : undefined}
          >
            <div className="mt-6 flex flex-col gap-4">
              {themesError && (
                <Alert
                  color="red"
                  variant="light"
                  title={t('Error')}
                  icon={<IconAlertTriangle size={16} />}
                >
                  {themesError}
                </Alert>
              )}
              {themesLoading ? (
                <div className="flex justify-center items-center h-64">
                  <Loader size="lg" />
                </div>
              ) : themes.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                  <IconPalette size={64} className="mb-4 opacity-50" />
                  <p className="text-lg">{t('No themes found')}</p>
                </div>
              ) : (
                <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="lg">
                  {themes.map((theme) => {
                    const isSelected = record.selected_theme === theme.folder_name;
                    return (
                      <MantineCard
                        key={theme.folder_name}
                        shadow="sm"
                        padding={0}
                        radius="md"
                        withBorder
                        onClick={() => setRecord({ ...record, selected_theme: theme.folder_name })}
                        className={`cursor-pointer hover:shadow-md transition-shadow ${isSelected ? 'border-green-500 border-2' : ''}`}
                      >
                        {theme.image && (
                          <div className="w-full h-[180px] bg-gray-100 overflow-hidden">
                            <img
                              src={`${backendHost}/theme/preview-image/${theme.folder_name}/${theme.image}`}
                              alt={theme.name}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.target.style.display = 'none';
                              }}
                            />
                          </div>
                        )}

                        <div className="flex flex-col h-full p-4">
                          <div className="mb-2">
                            <h3 className="text-lg font-semibold text-gray-900 mb-1">
                              {theme.name}
                            </h3>
                            <div className="flex gap-2 items-center">
                              <Badge color="blue" variant="light" size="sm">
                                v{theme.version}
                              </Badge>
                              {isSelected && (
                                <Badge
                                  color="green"
                                  variant="filled"
                                  size="sm"
                                  leftSection={<IconCheck size={12} />}
                                >
                                  {t('Selected')}
                                </Badge>
                              )}
                            </div>
                          </div>

                          {theme.description && (
                            <p className="text-sm text-gray-600 mb-3 line-clamp-3">
                              {theme.description}
                            </p>
                          )}
                        </div>
                      </MantineCard>
                    );
                  })}
                </SimpleGrid>
              )}
            </div>
          </Stepper.Step>

          <Stepper.Step
            label={t('Basic Information')}
            description={t('Name and domains')}
            icon={<IconWorld size={16} />}
            color={active === 1 ? 'blue' : undefined}
          >
            <div className="mt-6 flex flex-col gap-4">
              <TextInput
                label={t('Website Name')}
                description={t('Give your website a name')}
                placeholder={t('Enter website name')}
                value={record.name}
                onChange={(e) =>
                  setRecord({
                    ...record,
                    name: e.target.value,
                  })
                }
                required
              />

              <TagsInput
                label={t('Domains')}
                description={t(
                  'Enter the domains for this website (e.g., example.com, subdomain.example.com). Press Enter to add each domain.',
                )}
                placeholder={t('Enter domain and press Enter')}
                value={record.domains || []}
                onChange={handleDomainsChange}
                required
                clearable
                size="md"
                radius="md"
                splitChars={[',', ' ']}
                maxDropdownHeight={200}
              />
            </div>
          </Stepper.Step>

          <Stepper.Step
            label={t('Languages')}
            description={t('Site languages')}
            icon={<IconLanguage size={16} />}
            color={active === 2 ? 'blue' : undefined}
          >
            <div className="mt-6 relative flex flex-col gap-4">
              <LoadingOverlay visible={localesLoading} />

              <MultiSelect
                label={t('Available Languages')}
                description={t('Select languages that will be available on your site')}
                placeholder={t('Select languages')}
                data={localeOptions}
                value={record?.available_languages?.map((lang) => lang.id.toString()) || []}
                onChange={handleAvailableLanguagesChange}
                size="md"
                radius="md"
                required
                searchable
                clearable
              />

              <Select
                label={t('Default Language')}
                description={t('The default language for your site')}
                placeholder={
                  record?.available_languages?.length
                    ? t('Select default language')
                    : t('Select available languages first')
                }
                data={localeOptions.filter((option) =>
                  record?.available_languages?.some((lang) => lang.id.toString() === option.value),
                )}
                value={record?.default_language_id?.toString() || ''}
                onChange={handleDefaultLanguageChange}
                disabled={!record?.available_languages?.length}
                required
                searchable
                clearable
                size="md"
                radius="md"
              />
            </div>
          </Stepper.Step>

          <Stepper.Step
            label={t('AI Configuration')}
            description={t('Optional')}
            icon={<IconKey size={16} />}
            color={active === 3 ? 'blue' : undefined}
          >
            <div className="mt-6 flex flex-col gap-4">
              <PasswordInput
                label={t('OpenRouter API Key (optional)')}
                description={t(
                  'API key for AI-powered translation and content generation features',
                )}
                placeholder={t('Enter OpenRouter API key')}
                value={record.openrouter_api_key || ''}
                onChange={(e) =>
                  setRecord({
                    ...record,
                    openrouter_api_key: e.target.value,
                  })
                }
              />

              <RecordSelect
                model="openrouter_model"
                displayField="string_id"
                pageSize={1000}
                searchFields={['string_id', 'name']}
                label={t('Translation model (optional)')}
                description={t('AI model used for translating content between languages')}
                placeholder={t('Select a AI model')}
                value={record?.ai_translation_model_id}
                onChange={(value) =>
                  setRecord({
                    ...record,
                    ai_translation_model_id: value,
                  })
                }
              />

              <RecordSelect
                model="openrouter_model"
                displayField="string_id"
                pageSize={1000}
                searchFields={['string_id', 'name']}
                label={t('Default writing model (optional)')}
                description={t('Default AI model for generating new content')}
                placeholder={t('Select a AI model')}
                value={record?.ai_default_writing_model_id}
                onChange={(value) =>
                  setRecord({
                    ...record,
                    ai_default_writing_model_id: value,
                  })
                }
              />

              <RecordSelect
                model="openrouter_model"
                displayField="string_id"
                pageSize={1000}
                searchFields={['string_id', 'name']}
                label={t('Autocomplete model (optional)')}
                description={t('AI model used for text autocomplete and suggestions')}
                placeholder={t('Select a AI model')}
                value={record?.ai_autocomplete_model_id}
                onChange={(value) =>
                  setRecord({
                    ...record,
                    ai_autocomplete_model_id: value,
                  })
                }
              />
            </div>
          </Stepper.Step>
        </Stepper>

        <Group justify="flex-end" mt="xl">
          {active > 0 && (
            <Button variant="default" onClick={prevStep} disabled={loading}>
              {t('Back')}
            </Button>
          )}
          {active < 3 ? (
            <Button
              onClick={nextStep}
              disabled={active === 0 && !record.selected_theme}
              rightSection={<IconArrowRight size={16} />}
            >
              {t('Next step')}
            </Button>
          ) : (
            <Button
              loading={loading}
              onClick={handleSubmit}
              color="green"
              rightSection={<IconArrowRight size={16} />}
            >
              {t('Create Website')}
            </Button>
          )}
        </Group>
      </Card>
    </div>
  );
}
