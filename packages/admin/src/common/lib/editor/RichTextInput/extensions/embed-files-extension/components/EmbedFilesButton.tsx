import React, { useState } from 'react';
import type { Editor } from '@tiptap/core';
import { IconFileText } from '@tabler/icons-react';
import { Tooltip } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { MAX_FILES_COUNT } from '../utils';
import FilesSelectorModal from './FilesSelectorModal';
import type { EmbedFileItem } from '../types';
import type { User } from '../../../../../types';

interface EmbedFilesButtonProps {
  editor: Editor | null;
  backendHost: string;
  user: User;
  setUser: (user: User | null) => void;
  children?: React.ReactNode;
}

/**
 * Button to insert files into the editor
 *
 * @constructor
 */
const EmbedFilesButton = ({
  editor,
  backendHost,
  user,
  setUser,
  children,
}: EmbedFilesButtonProps) => {
  const { t } = useTranslation();

  const [isFilesSelectorModalOpened, setIsFilesSelectorModalOpened] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<EmbedFileItem[]>([]);

  return (
    <>
      <Tooltip label={t(`Insert files (max ${MAX_FILES_COUNT})`)}>
        <button
          type="button"
          onClick={() => {
            setSelectedFiles([]);
            setIsFilesSelectorModalOpened(true);
          }}
          className="w-8 h-8 flex justify-center items-center rounded p-1 font-thin cursor-pointer hover:bg-[#e4e6ed]"
        >
          {children || <IconFileText size={22} className="text-[#808496]" />}
        </button>
      </Tooltip>

      <FilesSelectorModal
        backendHost={backendHost}
        user={user}
        setUser={setUser}
        editor={editor}
        opened={isFilesSelectorModalOpened}
        setOpened={setIsFilesSelectorModalOpened}
        selectedFiles={selectedFiles}
        setSelectedFiles={setSelectedFiles}
      />
    </>
  );
};

export default EmbedFilesButton;
