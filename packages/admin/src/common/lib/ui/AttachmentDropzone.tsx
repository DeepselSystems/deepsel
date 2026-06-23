import React from 'react';
import { useTranslation } from 'react-i18next';
import { Dropzone } from '@mantine/dropzone';
import { Group, Text } from '@mantine/core';
import { IconCloudUpload, IconPhoto, IconUpload, IconX } from '@tabler/icons-react';

interface AttachmentDropzoneProps {
  /** Called with the accepted File list when the user drops or selects files */
  onDrop: (files: File[]) => void;
  /** MIME type whitelist passed to Dropzone; omit to allow any file type */
  accept?: string[];
  /** When true, shows an image icon in idle state instead of the generic upload icon */
  imageMode?: boolean;
  /** Extra className applied to the outer wrapper div */
  className?: string;
  /** Disables the dropzone when true */
  disabled?: boolean;
}

/**
 * Shared dropzone UI for attachment uploads.
 * Contains no upload logic — the consumer handles the actual API call via onDrop.
 */
export function AttachmentDropzone({
  onDrop,
  accept,
  imageMode = false,
  className,
  disabled = false,
}: AttachmentDropzoneProps) {
  const { t } = useTranslation();

  return (
    <Dropzone
      onDrop={onDrop}
      accept={accept}
      disabled={disabled}
      className={
        className ??
        'border-dashed border-2 border-gray-300 rounded-lg p-4 cursor-pointer hover:border-primary-main transition-colors'
      }
    >
      <Group justify="center" gap="xl" className="min-h-24 pointer-events-none">
        <Dropzone.Accept>
          <IconCloudUpload size={16} className="text-3xl text-green-500" />
        </Dropzone.Accept>
        <Dropzone.Reject>
          <IconX size={16} className="text-3xl text-red-500" />
        </Dropzone.Reject>
        <Dropzone.Idle>
          {imageMode ? (
            <IconPhoto size={16} className="text-3xl text-gray-500" />
          ) : (
            <IconUpload size={16} className="text-3xl text-gray-500" />
          )}
        </Dropzone.Idle>

        <div className="text-center">
          <Text size="xl" inline className="font-medium">
            {t('Drag files here or click to select files')}
          </Text>
          <Text size="sm" inline mt={7}>
            {t('Upload as many files as you need')}
          </Text>
        </div>
      </Group>
    </Dropzone>
  );
}
