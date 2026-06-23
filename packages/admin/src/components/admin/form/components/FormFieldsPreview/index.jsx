import React from 'react';
import { FormRenderer } from '@deepsel/cms-react';
import { Box, Center, Stack } from '@mantine/core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useTranslation } from 'react-i18next';
import { faFileWaveform } from '@fortawesome/free-solid-svg-icons';
import useUploadSizeLimit from '../../../../../common/api/useUploadSizeLimit.js';
import useUpload from '../../../../../common/api/useUpload.js';
import useModel from '../../../../../common/api/useModel.jsx';

/**
 * Preview form fields in the admin form builder.
 * @param {FormContent} formContent
 * @returns {JSX.Element}
 */
const FormFieldsPreview = ({ formContent }) => {
  const { t } = useTranslation();
  const { uploadSizeLimit } = useUploadSizeLimit();
  const { uploadFileModel } = useUpload();
  const { del: deleteAttachment } = useModel('attachment');

  const hasContent = React.useMemo(
    () =>
      formContent &&
      !![!!formContent.fields?.length, !!formContent.title, !!formContent.description].find(
        Boolean,
      ),
    [formContent],
  );

  const handleUploadFiles = async (files) => uploadFileModel('attachment', files);
  const handleDeleteAttachment = async (id) => deleteAttachment(id);

  return (
    <>
      {hasContent ? (
        <FormRenderer
          formContent={formContent}
          uploadSizeLimit={uploadSizeLimit}
          onUploadFiles={handleUploadFiles}
          onDeleteAttachment={handleDeleteAttachment}
        />
      ) : (
        <Box className="my-20 text-gray-pale-sky">
          <Center>
            <Stack align="center" gap="md">
              <FontAwesomeIcon icon={faFileWaveform} size="2x" />
              <Box className="text-center">{t('Add fields to see preview')}</Box>
            </Stack>
          </Center>
        </Box>
      )}
    </>
  );
};

export default FormFieldsPreview;
