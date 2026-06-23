import SubmissionInformation from '../submission-infomation/index.jsx';
import { Box, Paper, Stack } from '@mantine/core';
import H3 from '../../../../../common/ui/H3.jsx';
import { useTranslation } from 'react-i18next';
import { FormSubmissionViewer } from '@deepsel/cms-react';

/**
 * Current submission
 *
 * @param {FormSubmission} submission
 * @returns {JSX.Element}
 * @constructor
 */
const SubmissionCurrent = ({ submission }) => {
  // Translation
  const { t } = useTranslation();

  return (
    <>
      <Box className="space-y-3">
        {/* Submission Information Section */}
        <SubmissionInformation submission={submission} />

        {/* Submitter data */}
        <Paper withBorder shadow="sm" p="lg" radius="md">
          <Stack gap="md">
            <H3>{t('Submitted Form Data')}</H3>

            {/* Submitted form data */}
            <Box className="py-6">
              <FormSubmissionViewer
                showTitle
                formContent={submission.form_content}
                submissionData={submission.submission_data}
              />
            </Box>
          </Stack>
        </Paper>
      </Box>
    </>
  );
};

export default SubmissionCurrent;
