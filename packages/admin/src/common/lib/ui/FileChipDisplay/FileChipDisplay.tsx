import React from 'react';
import { Link } from 'react-router-dom';

import { getAttachmentUrl } from '@deepsel/cms-utils';
import { Chip } from '../Chip';
import { IconDownload } from '@tabler/icons-react';

export interface FileChipDisplayProps {
  /** Attachment object containing the file name */
  attachment: {
    name: string;
  };

  /**
   * Backend host URL.
   * Typically sourced from BackendHostURLState.
   */
  backendHost: string;
}

/**
 * Renders a file attachment as a downloadable chip link.
 * Clicking opens the file in a new browser tab.
 */
export function FileChipDisplay({ attachment, backendHost }: FileChipDisplayProps) {
  function downloadFile(e: React.MouseEvent) {
    e.preventDefault();
    window.open(getAttachmentUrl(backendHost, attachment.name), '_blank');
  }

  return (
    <Link
      to={getAttachmentUrl(backendHost, attachment.name)}
      onClick={downloadFile}
      target="_blank"
      className="cursor-pointer text-primary-main"
      style={{ fontSize: 'var(--mantine-font-size-sm)' }}
    >
      <Chip
        icon={<IconDownload size={18} className="mr-1 text-primary-main" />}
        size="xs"
        variant="outline"
        checked={true}
      >
        {attachment.name}
      </Chip>
    </Link>
  );
}
