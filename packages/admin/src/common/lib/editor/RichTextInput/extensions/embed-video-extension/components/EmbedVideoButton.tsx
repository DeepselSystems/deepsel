import React, { useState } from 'react';
import type { Editor } from '@tiptap/core';
import { IconVideo } from '@tabler/icons-react';
import { Tooltip } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { ChooseAttachmentModal } from '../../../../../ui';
import type { AttachmentFile } from '../../../../../ui';
import type { User } from '../../../../../types';

interface EmbedVideoButtonProps {
  editor: Editor | null;
  backendHost: string;
  user: User;
  setUser: (user: User | null) => void;
  children?: React.ReactNode;
}

/**
 * Button to insert video into the editor
 */
const EmbedVideoButton = ({
  backendHost,
  user,
  setUser,
  editor,
  children,
}: EmbedVideoButtonProps) => {
  const { t } = useTranslation();
  const [isAttachmentModalOpened, setAttachmentModalOpened] = useState(false);

  return (
    <>
      <Tooltip label={t('Insert video')}>
        <button
          type="button"
          onClick={() => setAttachmentModalOpened(true)}
          className="w-8 h-8 flex justify-center items-center rounded p-1 font-thin cursor-pointer hover:bg-[#e4e6ed]"
        >
          {children || <IconVideo size={22} className="text-[#808496]" />}
        </button>
      </Tooltip>

      <ChooseAttachmentModal
        backendHost={backendHost}
        user={user}
        setUser={setUser}
        type="video"
        filters={[
          {
            field: 'locale_versions.content_type',
            operator: 'like',
            value: 'video%',
          },
        ]}
        isOpen={isAttachmentModalOpened}
        close={() => setAttachmentModalOpened(false)}
        onChange={(attachment: AttachmentFile) => {
          const attachmentName = attachment.name ?? '';
          if (editor) {
            editor.chain().focus().setEmbedVideo({ src: attachmentName }).run();
            setTimeout(() => {
              editor.chain().focus().createParagraphNear().run();
            }, 300);
          }
        }}
      />
    </>
  );
};

export default EmbedVideoButton;
