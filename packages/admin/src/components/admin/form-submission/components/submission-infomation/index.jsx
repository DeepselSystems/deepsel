import { Group, Paper, Stack, Text, Tooltip } from '@mantine/core';
import H3 from '../../../../../common/ui/H3.jsx';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCalendar, faDesktop, faGlobe } from '@fortawesome/free-solid-svg-icons';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';

/**
 * Submission information
 *
 * @param {FormSubmission} submission
 * @returns {JSX.Element}
 * @constructor
 */
const SubmissionInformation = ({ submission }) => {
  // Translation
  const { t } = useTranslation();

  return (
    <>
      <Paper withBorder shadow="sm" p="lg" radius="md">
        <Stack gap="md">
          <H3>{t('Submission Information')}</H3>

          <Group gap="xl" className="flex-wrap">
            {/* Submitted Date */}
            <Group gap="xs">
              <FontAwesomeIcon icon={faCalendar} className="text-gray-500" />
              <Text size="sm" c="dimmed" fw={500}>
                {t('Submitted')}:
              </Text>
              <Text size="sm" fw={500}>
                {dayjs
                  .utc(submission.updated_at)
                  .tz(Intl.DateTimeFormat().resolvedOptions().timeZone)
                  .format('D MMM YYYY HH:mm') +
                  ` (${Intl.DateTimeFormat().resolvedOptions().timeZone})`}
              </Text>
            </Group>

            {/* Submitter IP */}
            <Group gap="xs">
              <FontAwesomeIcon icon={faGlobe} className="text-gray-500" />
              <Text size="sm" c="dimmed" fw={500}>
                {t('IP Address')}:
              </Text>
              <Text size="sm" fw={500} className="font-mono">
                {submission.submitter_ip || t('N/A')}
              </Text>
            </Group>
          </Group>

          {/* User Agent */}
          {submission.submitter_user_agent && (
            <Group gap="xs" mb="xs" align="center">
              <Group gap="xs">
                <FontAwesomeIcon icon={faDesktop} className="text-gray-500" />
                <Text size="sm" c="dimmed" fw={500}>
                  {t('User Agent')}:
                </Text>
              </Group>
              <Tooltip
                withArrow
                openDelay={500}
                position="bottom"
                label={submission.submitter_user_agent}
              >
                <Text size="xs" className="font-mono bg-gray-50 p-2 rounded max-w-2xl truncate">
                  {submission.submitter_user_agent}
                </Text>
              </Tooltip>
            </Group>
          )}
        </Stack>
      </Paper>
    </>
  );
};

export default SubmissionInformation;
