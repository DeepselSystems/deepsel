import React, { memo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, Alert, Group, Stack, Tabs, Paper, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faTriangleExclamation,
  faArrowLeft,
  faUser,
  faList,
  faLanguage,
} from '@fortawesome/free-solid-svg-icons';
import Button from '../../../common/ui/Button.jsx';
import useFetch from '../../../common/api/useFetch.js';
import useEffectOnce from '../../../common/hooks/useEffectOnce.js';
import SubmissionVersions from './components/sumission-versions/index.jsx';
import SubmissionCurrent from './components/submission-current/index.jsx';
import H3 from '../../../common/ui/H3.jsx';
import clsx from 'clsx';

const SubmissionTabs = {
  Current: 'Current',
  Versions: 'Versions',
};

const SubmissionTabLabel = memo(({ tab }) => {
  // Translation
  const { t } = useTranslation();

  return (
    <Stack gap={4}>
      {tab === SubmissionTabs.Current && (
        <>
          <Box component="h2">{t('Current Submission')}</Box>
        </>
      )}
      {tab === SubmissionTabs.Versions && (
        <>
          <Box component="h2">{t('Version History')}</Box>
        </>
      )}
    </Stack>
  );
});
SubmissionTabLabel.displayName = 'SubmissionTabLabel';

/**
 * Form submission view component for displaying submission details and form data
 * @returns {JSX.Element}
 */
const FormSubmissionView = () => {
  const { id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Form submission query hook
  const { get: getFormSubmission } = useFetch(`form_submission/${id}`, {
    autoFetch: false,
  });

  // State management
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [formSubmission, setFormSubmission] = React.useState(
    /**@type {FormSubmission | null}*/ null,
  );

  /**
   * Handle back navigation to form submissions list
   */
  const handleBack = React.useCallback(() => {
    navigate('/form-submissions');
  }, [navigate]);

  /**
   * Load form submission data on component mount
   */
  useEffectOnce(() => {
    if (id) {
      setLoading(true);
      setError(null);
      getFormSubmission(id)
        .then((data) => {
          setFormSubmission(data);
        })
        .catch((err) => {
          setError(err.message || t('Failed to load form submission'));
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

  // Show error state
  if (error) {
    return (
      <Box className="space-y-6 h-[calc(100vh-var(--app-shell-header-height)-2rem)] p-6">
        <Alert
          color="red"
          variant="light"
          title={t('Error')}
          icon={<FontAwesomeIcon icon={faTriangleExclamation} />}
        >
          {error}
        </Alert>
      </Box>
    );
  }

  // Show not found state
  if (!formSubmission) {
    return (
      <Box className="flex items-center justify-center h-96">
        <Box className="text-gray-pale-sky">{t('Form submission not found')}</Box>
      </Box>
    );
  }

  return (
    <>
      <Box className="space-y-6 min-h-[calc(100vh-var(--app-shell-header-height)-2rem)] p-6">
        {/* Header with Back Button */}
        <Group justify="space-between" align="center">
          <Button
            variant="outline"
            leftSection={<FontAwesomeIcon icon={faArrowLeft} />}
            onClick={handleBack}
          >
            {t('Back')}
          </Button>
        </Group>

        {/* Form and user information */}
        <Paper withBorder shadow="sm" p="lg" pb="xl" radius="md">
          <Stack gap="md">
            <H3>{t('Form and User')}</H3>

            <Group gap="xl" className="flex-wrap">
              <Group gap="xs">
                <FontAwesomeIcon icon={faList} className="text-gray-500" />
                <Text size="sm" c="dimmed" fw={500}>
                  {t('Form title')}:
                </Text>
                <Text size="sm" fw={500}>
                  {formSubmission.form_content.title}
                </Text>
              </Group>

              <Group gap="xs">
                <FontAwesomeIcon icon={faLanguage} className="text-gray-500" />
                <Text size="sm" c="dimmed" fw={500}>
                  {t('Language')}:
                </Text>
                <Group gap="xs">
                  <Text size="sm">{formSubmission.form_content.locale.emoji_flag}</Text>
                  <Text size="sm" fw={500}>
                    {formSubmission.form_content.locale.name}
                  </Text>
                </Group>
              </Group>

              {/* Submitter User */}
              <Group gap="xs">
                <FontAwesomeIcon icon={faUser} className="text-gray-500" />
                <Text size="sm" c="dimmed" fw={500}>
                  {t('User')}:
                </Text>
                <Text size="sm" fw={500}>
                  {formSubmission.submitter_user
                    ? formSubmission.submitter_user.username ||
                      formSubmission.submitter_user.email ||
                      `${formSubmission.submitter_user.first_name || ''} ${formSubmission.submitter_user.last_name || ''}`.trim()
                    : t('Anonymous')}
                </Text>
              </Group>
            </Group>
          </Stack>
        </Paper>

        {/* Form Data Section */}
        <Tabs
          variant="pills"
          classNames={{
            list: clsx('!mb-3', !formSubmission.form_content.enable_edit_submission && '!hidden'),
            tab: '!bg-gray-100 data-[active]:!bg-primary-main',
          }}
          defaultValue={SubmissionTabs.Current}
        >
          <Tabs.List>
            {Object.values(SubmissionTabs).map((tab, index) => (
              <Tabs.Tab key={index} value={tab}>
                <SubmissionTabLabel tab={tab} />
              </Tabs.Tab>
            ))}
          </Tabs.List>

          <Tabs.Panel value={SubmissionTabs.Current}>
            <SubmissionCurrent submission={formSubmission} />
          </Tabs.Panel>

          <Tabs.Panel value={SubmissionTabs.Versions}>
            <SubmissionVersions submission={formSubmission} />
          </Tabs.Panel>
        </Tabs>
      </Box>
    </>
  );
};

export default FormSubmissionView;
