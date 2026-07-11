import { useTranslation } from 'react-i18next';
import useUpload from '../../api/useUpload.js';
import NotificationState from '../../stores/NotificationState.js';
import { AttachmentDropzone } from '../../lib/ui/AttachmentDropzone.tsx';

/**
 * Dropzone upload area for the Media Library.
 * Handles file selection, upload, and notifies parent of results.
 *
 * @param {object} props
 * @param {(files: object[]) => void} props.onFilesUploaded - Called with uploaded file objects on success
 * @param {() => void} [props.onStorageChange] - Called after upload to trigger storage info refresh
 */
export function MediaDropzone({ onFilesUploaded, onStorageChange }) {
  const { t } = useTranslation();
  const { notify } = NotificationState((state) => state);
  const { uploadFileModel } = useUpload();

  /**
   * Handles file drop event and uploads files to the server.
   * @param {File[]} files - The files to upload.
   */
  const handleDrop = async (files) => {
    try {
      const uploadedFiles = await uploadFileModel('attachment', files);
      if (uploadedFiles) {
        const filesArray = Array.isArray(uploadedFiles) ? uploadedFiles : [uploadedFiles];
        onFilesUploaded(filesArray);
        notify({
          title: t('Success'),
          message: t('Files uploaded successfully'),
          type: 'success',
        });
      }
      onStorageChange?.();
    } catch (error) {
      console.error('Error uploading file:', error);
      notify({
        title: t('Error'),
        message: error.message || t('Failed to upload file'),
        type: 'error',
      });
    }
  };

  return (
    <div className="my-6">
      <AttachmentDropzone onDrop={handleDrop} />
    </div>
  );
}
