import { useMemo } from 'react';
import { Box, Paper, Stack, Tabs, Text } from '@mantine/core';
import fromPairs from 'lodash/fromPairs';
import dayjs from 'dayjs';
import { first } from 'lodash';
import SubmissionInformation from '../submission-infomation/index.jsx';
import orderBy from 'lodash/orderBy';
import H3 from '../../../../../common/ui/H3.jsx';
import { useTranslation } from 'react-i18next';
import { FormSubmissionViewer } from '@deepsel/cms-react';

/**
 * Submission versions list component
 *
 * @param {FormSubmission} submission
 * @returns {JSX.Element}
 * @constructor
 */
const SubmissionVersions = ({ submission }) => {
  // Translation
  const { t } = useTranslation();

  /**
   * Get submission history versions map
   * @type {Record<string, FormSubmission>}
   */
  const versionsMap = useMemo(
    () =>
      fromPairs(
        orderBy(submission.submission_versions || [], ['submitted_at'], ['desc']).map(
          (submissionVersion) => [submissionVersion.submitted_at, submissionVersion],
        ),
      ),
    [submission.submission_versions],
  );

  // Check if there are no submission versions
  if (!submission.submission_versions || submission.submission_versions.length === 0) {
    return (
      <Paper withBorder shadow="sm" py="xl" px="lg" radius="md">
        <Text c="dimmed" ta="center">
          No previous submissions available
        </Text>
      </Paper>
    );
  }

  return (
    <>
      <Tabs
        classNames={{
          list: '!mr-6',
        }}
        orientation="vertical"
        variant="outline"
        defaultValue={first(Object.keys(versionsMap))}
      >
        <Tabs.List>
          {Object.keys(versionsMap).map((versionKey, index) => (
            <Tabs.Tab key={index} value={versionKey}>
              {dayjs
                .utc(versionKey)
                .tz(Intl.DateTimeFormat().resolvedOptions().timeZone)
                .format('D MMM YYYY HH:mm') +
                ` (${Intl.DateTimeFormat().resolvedOptions().timeZone})`}
            </Tabs.Tab>
          ))}
        </Tabs.List>

        <>
          {Object.keys(versionsMap).map((versionKey, index) => (
            <Tabs.Panel key={index} value={versionKey}>
              <Box className="space-y-3">
                {/* Submission Information Section */}
                <SubmissionInformation submission={versionsMap[versionKey]} />

                {/* Submitter data */}
                <Paper withBorder shadow="sm" p="lg" radius="md">
                  <Stack gap="md">
                    <Paper shadow="none">
                      <Stack gap="md">
                        <H3>{t('Submitted Form Data')}</H3>

                        <FormSubmissionViewer
                          showTitle
                          formContent={submission.form_content}
                          submissionData={versionsMap[versionKey].submission_data}
                        />
                      </Stack>
                    </Paper>
                  </Stack>
                </Paper>
              </Box>
            </Tabs.Panel>
          ))}
        </>
      </Tabs>
    </>
  );
};

export default SubmissionVersions;
