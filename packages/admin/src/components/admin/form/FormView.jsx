import React from 'react';
import { Tabs, Box, CopyButton } from '@mantine/core';
import { getFlagUrl } from '@deepsel/cms-utils/flags';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faStickyNote,
  faExternalLinkAlt,
  faCopy,
  faPen,
  faNewspaper,
  faChartBar,
} from '@fortawesome/free-solid-svg-icons';
import fromPairs from 'lodash/fromPairs';
import head from 'lodash/head';
import useFetch from '../../../common/api/useFetch.js';
import useEffectOnce from '../../../common/hooks/useEffectOnce.js';
import NotificationState from '../../../common/stores/NotificationState.js';
import Button from '../../../common/ui/Button.jsx';
import Switch from '../../../common/ui/Switch.jsx';
import FormFieldsPreview from '../../../common/ui/form-builder/FormFieldsPreview/index.jsx';
import OrganizationIdState from '../../../common/stores/OrganizationIdState.js';

/**
 * Form view component for displaying form preview with language tabs
 * @returns {JSX.Element}
 */
const FormView = () => {
  const { id } = useParams();
  const { organizationId } = OrganizationIdState();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { notify } = NotificationState((state) => state);

  // Form query hooks
  const { get: getForm, put: updateForm } = useFetch(`form/${id}`, {
    autoFetch: false,
  });

  // State management
  const [loading, setLoading] = React.useState(false);
  const [publishLoading, setPublishLoading] = React.useState(false);
  const [form, setForm] = React.useState(/**@type {Form | null}*/ null);

  // Selected locale ID for tabs
  const [selectedLocaleId, setSelectedLocaleId] = React.useState(/**@type {string|null}*/ null);

  // Form content map with localeId
  const [formContentsMap, setFormContentMap] = React.useState(
    /**@type {Record<number, FormContent>}*/ {},
  );

  // Memoize the form URL to avoid recalculation
  const formUrl = React.useMemo(() => {
    if (!selectedLocaleId || !formContentsMap[selectedLocaleId]?.slug) return '';
    return `${window.origin}/${formContentsMap[selectedLocaleId].locale.iso_code}/forms${formContentsMap[selectedLocaleId].slug}`;
  }, [selectedLocaleId, formContentsMap]);

  // Memoize the submissions URL
  const submissionsUrl = React.useMemo(() => {
    if (formContentsMap[selectedLocaleId]) {
      const searchParams = new URLSearchParams({
        filters: JSON.stringify([
          {
            field: 'form.organization_id',
            operator: '=',
            value: organizationId,
          },
          {
            field: 'form_content_id',
            operator: '=',
            value: formContentsMap[selectedLocaleId].id,
          },
        ]).toString(),
      });
      return `/form-submissions?${searchParams}`;
    } else {
      return '/form-submissions';
    }
  }, [formContentsMap, organizationId, selectedLocaleId]);

  // Memoize the statistics URL
  const statisticsUrl = React.useMemo(() => {
    if (!selectedLocaleId || !formContentsMap[selectedLocaleId]?.slug) return '';
    return `${formUrl}/statistics`;
  }, [formUrl, selectedLocaleId, formContentsMap]);

  /**
   * Handle publish toggle
   * @param {boolean} published
   */
  const handlePublishToggle = React.useCallback(
    async (published) => {
      if (!form) return;

      setPublishLoading(true);
      try {
        const updatedForm = await updateForm({
          ...form,
          published,
          contents: Object.values(formContentsMap),
        });

        setForm(updatedForm);
        notify({
          message: t(published ? 'Form published successfully!' : 'Form unpublished successfully!'),
          type: 'success',
        });
      } catch (error) {
        notify({
          message: t('Failed to update form status'),
          type: 'error',
        });
      } finally {
        setPublishLoading(false);
      }
    },
    [form, formContentsMap, updateForm, notify, t],
  );

  /**
   * Handle edit button click
   */
  const handleEdit = React.useCallback(() => {
    navigate(`/forms/${id}/edit`);
  }, [navigate, id]);

  /**
   * Load form data on component mount
   */
  useEffectOnce(() => {
    if (id) {
      setLoading(true);
      getForm(id)
        .then((data) => {
          setForm(data);
          const contentsMap = fromPairs(
            data?.contents?.map((content) => [content.locale_id, content]) || [],
          );
          setFormContentMap(contentsMap);

          // Set first available locale as selected
          const firstLocaleId = head(Object.keys(contentsMap));
          if (firstLocaleId) {
            setSelectedLocaleId(firstLocaleId);
          }
        })
        .catch(() => {
          notify({
            message: t('Failed to load form'),
            type: 'error',
          });
        })
        .finally(() => {
          setLoading(false);
        });
    }
  });

  // Show loading state
  if (loading) {
    return (
      <Box className="flex items-center justify-center h-96">
        <Box className="text-gray-pale-sky">{t('Loading...')}</Box>
      </Box>
    );
  }

  // Show error state if no form data
  if (!form) {
    return (
      <Box className="flex items-center justify-center h-96">
        <Box className="text-gray-pale-sky">{t('Form not found')}</Box>
      </Box>
    );
  }

  return (
    <Box className="space-y-6 h-[calc(100vh-var(--app-shell-header-height)-2rem)]">
      {Object.keys(formContentsMap).length ? (
        <>
          {/* Action Bar */}
          <Box className="flex justify-end items-center gap-6">
            {form?.published && selectedLocaleId && formContentsMap[selectedLocaleId]?.slug && (
              <Box className="flex gap-2">
                <CopyButton value={formUrl}>
                  {({ copied, copy }) => (
                    <Button
                      disabled={!formContentsMap[selectedLocaleId]}
                      variant="light"
                      onClick={copy}
                      leftSection={<FontAwesomeIcon icon={faCopy} />}
                    >
                      {copied ? t('Copied!') : t('Copy share link')}
                    </Button>
                  )}
                </CopyButton>
                <Button
                  disabled={!formContentsMap[selectedLocaleId]}
                  component={Link}
                  to={formUrl}
                  target="_blank"
                  leftSection={<FontAwesomeIcon icon={faExternalLinkAlt} />}
                  variant="light"
                >
                  {t('Go to page')}
                </Button>
                <Button
                  disabled={!formContentsMap[selectedLocaleId]}
                  component={Link}
                  to={statisticsUrl}
                  target="_blank"
                  leftSection={<FontAwesomeIcon icon={faChartBar} />}
                  variant="light"
                >
                  {t('View statistics')}
                </Button>
                <Button
                  disabled={!formContentsMap[selectedLocaleId]}
                  component={Link}
                  to={submissionsUrl}
                  leftSection={<FontAwesomeIcon icon={faNewspaper} />}
                  variant="filled"
                >
                  {t('View submissions')}
                </Button>
              </Box>
            )}
            <Switch
              checked={!!form?.published}
              onLabel={t('Published')}
              offLabel={t('Unpublished')}
              size="xl"
              disabled={publishLoading}
              classNames={{
                track: 'px-2',
              }}
              onChange={({ currentTarget: { checked } }) => handlePublishToggle(checked)}
            />
            <Button
              variant="filled"
              leftSection={<FontAwesomeIcon icon={faPen} />}
              onClick={handleEdit}
            >
              {t('Edit')}
            </Button>
          </Box>

          {/* Form Preview with Language Tabs */}
          <Tabs
            value={String(selectedLocaleId)}
            onChange={setSelectedLocaleId}
            variant="pills"
            className="!h-[calc(100%-4rem)]"
          >
            {/* Language Tabs */}
            <Tabs.List className="pb-6">
              {Object.keys(formContentsMap)
                .reverse()
                .map((localeId, index) => (
                  <Tabs.Tab key={index} value={String(localeId)}>
                    <Box className="flex gap-3">
                      <img
                        src={getFlagUrl(formContentsMap[localeId].locale?.iso_code ?? '')}
                        alt={formContentsMap[localeId].locale?.name ?? ''}
                        className="h-4 w-auto rounded-sm inline-block"
                      />
                      <span>{formContentsMap[localeId].locale?.name}</span>
                    </Box>
                  </Tabs.Tab>
                ))}
            </Tabs.List>

            {/* Form Preview Content */}
            <Box className="h-[calc(100%-3rem)] overflow-auto">
              <Box className=" bg-gray-zumthor rounded-xl shadow p-20 h-full overflow-auto">
                {Object.keys(formContentsMap).map((localeId, index) => (
                  <Tabs.Panel key={index} value={String(localeId)}>
                    <Box className="container">
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
                    </Box>
                  </Tabs.Panel>
                ))}
              </Box>
            </Box>
          </Tabs>
        </>
      ) : (
        <Box className="text-gray-pale-sky h-full">
          <Box className="text-center space-y-4 my-20">
            <Box>
              <FontAwesomeIcon icon={faStickyNote} size="2xl" className="rotate-180" />
            </Box>
            <Box>{t('This form has no content in any language')}</Box>
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default FormView;
