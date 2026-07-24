import React, { useState } from 'react';
import type { Editor } from '@tiptap/core';
import { IconVolume } from '@tabler/icons-react';
import { Tooltip } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { ChooseAttachmentModal } from '../../../../../ui';
import type { AttachmentFile } from '../../../../../ui';
import type { User } from '../../../../../types';

interface EmbedAudioButtonProps {
  editor: Editor | null;
  children?: React.ReactNode;
  backendHost: string;
  user: User;
  setUser: (user: User | null) => void;
}

/**
 * Button to insert audio into the editor
 */
const EmbedAudioButton = ({
  backendHost,
  user,
  setUser,
  editor,
  children,
}: EmbedAudioButtonProps) => {
  const { t } = useTranslation();
  const [isAttachmentModalOpened, setAttachmentModalOpened] = useState(false);

  return (
    <>
      <Tooltip label={t('Insert audio')}>
        <button
          type="button"
          onClick={() => setAttachmentModalOpened(true)}
          className="w-8 h-8 flex justify-center items-center rounded p-1 font-thin cursor-pointer hover:bg-[#e4e6ed]"
        >
          {children || <IconVolume size={22} className="text-[#808496]" />}
        </button>
      </Tooltip>

      <ChooseAttachmentModal
        backendHost={backendHost}
        user={user}
        setUser={setUser}
        type="audio"
        filters={[
          {
            field: 'locale_versions.content_type',
            operator: 'like',
            value: 'audio%',
          },
        ]}
        isOpen={isAttachmentModalOpened}
        close={() => setAttachmentModalOpened(false)}
        onChange={(attachment: AttachmentFile) => {
          const attachmentName = attachment.name ?? '';
          if (editor) {
            editor.chain().focus().setEmbedAudio({ src: attachmentName }).run();
            setTimeout(() => {
              editor.chain().focus().createParagraphNear().run();
            }, 300);
          }
        }}
      />
    </>
  );
};

export default EmbedAudioButton;
