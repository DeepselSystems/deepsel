import React, { useState } from 'react';
import type { Editor } from '@tiptap/core';
import { IconPhoto } from '@tabler/icons-react';
import { Tooltip } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { EnhancedImageSelectorModal } from '../../../../../ui';
import type { User } from '../../../../../types';

interface EnhancedImageButtonProps {
  editor: Editor | null;
  onAddImageOverride?: (url: string) => void;
  children?: React.ReactNode;
  backendHost: string;
  user: User | null;
  setUser: (user: User | null) => void;
  currentLocaleId?: number | null;
}

interface Attachment {
  name: string | null;
}

/**
 * Button to insert image into the editor
 *
 * @constructor
 */
const EnhancedImageButton = ({
  editor,
  onAddImageOverride = () => {},
  backendHost,
  user,
  setUser,
  currentLocaleId,
  children,
}: EnhancedImageButtonProps) => {
  const { t } = useTranslation();

  const [enhanceImageSelectorModalOpened, setEnhanceImageSelectorModalOpened] = useState(false);

  return (
    <>
      <Tooltip label={t('Insert Image')}>
        <button
          type="button"
          onClick={() => setEnhanceImageSelectorModalOpened(true)}
          className="w-8 h-8 flex justify-center items-center rounded p-1 font-thin cursor-pointer hover:bg-[#e4e6ed]"
        >
          {children || <IconPhoto size={22} className="text-[#808496]" />}
        </button>
      </Tooltip>

      <EnhancedImageSelectorModal
        backendHost={backendHost}
        user={user}
        setUser={setUser}
        opened={enhanceImageSelectorModalOpened}
        setOpened={setEnhanceImageSelectorModalOpened}
        currentLocaleId={currentLocaleId}
        onSelect={(attachment: Attachment) => {
          const attachmentName = attachment.name ?? '';

          onAddImageOverride(attachmentName);

          if (editor) {
            editor
              .chain()
              .focus()
              .setEnhancedImage({
                src: attachmentName,
              })
              .run();

            setTimeout(() => {
              editor.chain().focus().createParagraphNear().run();
            }, 300);
          }

          setEnhanceImageSelectorModalOpened(false);
        }}
      />
    </>
  );
};

export default EnhancedImageButton;
