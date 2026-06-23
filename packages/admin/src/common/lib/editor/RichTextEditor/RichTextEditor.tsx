import React from 'react';
import { useTranslation } from 'react-i18next';
import { IconPhoto } from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import { Link, RichTextEditor as MantineRichTextEditor } from '@mantine/tiptap';
import Highlight from '@tiptap/extension-highlight';
import Image from '@tiptap/extension-image';
import SubScript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { ChooseAttachmentModal } from '../../ui/ChooseAttachmentModal';
import { Button } from '../../ui/Button';
import type { User } from '../../types';

export interface RichTextEditorProps {
  /** Initial HTML content. */
  content?: string;

  /** Called with the current HTML when submitted (or on every change if autoSubmit is true). */
  onSubmit?: (html: string) => void;

  /** When true, calls onSubmit on every content change instead of waiting for form submit. */
  autoSubmit?: boolean;

  /**
   * Backend host URL.
   * Typically sourced from BackendHostURLState.
   */
  backendHost: string;

  /**
   * Currently authenticated user.
   * Typically sourced from UserState.
   */
  user: User;

  /**
   * Setter for the user state — used by underlying hooks to clear session on 401.
   * Typically sourced from UserState.
   */
  setUser: (user: User | null) => void;

  /** Additional className passed to the Mantine RichTextEditor wrapper. */
  className?: string;
}

/**
 * Lightweight rich text editor with basic formatting and image insertion.
 *
 * Requires backendHost, user, setUser props
 * (sourced from BackendHostURLState / UserState in the consuming app).
 */
export function RichTextEditor({
  content = '',
  onSubmit = () => {},
  autoSubmit = false,
  backendHost,
  user,
  setUser,
  className,
  ...others
}: RichTextEditorProps) {
  const { t } = useTranslation();

  const [isImageModalOpened, { open: openImageModal, close: closeImageModal }] =
    useDisclosure(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link,
      Superscript,
      SubScript,
      Highlight,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Image,
    ],
    content,
    onUpdate: ({ editor: e }) => {
      if (autoSubmit) {
        onSubmit(e.getHTML());
      }
    },
  });

  /**
   * Handle form submit — pass current HTML to onSubmit callback
   */
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editor) {
      onSubmit(editor.getHTML());
    }
  }

  return (
    <>
      <form className="flex flex-col" onSubmit={handleSubmit}>
        <MantineRichTextEditor editor={editor} className={`w-full ${className ?? ''}`} {...others}>
          <MantineRichTextEditor.Toolbar sticky stickyOffset={60}>
            <MantineRichTextEditor.ControlsGroup>
              <MantineRichTextEditor.Bold />
              <MantineRichTextEditor.Italic />
              <MantineRichTextEditor.Underline />
              <MantineRichTextEditor.Strikethrough />
              <MantineRichTextEditor.ClearFormatting />
              <MantineRichTextEditor.Highlight />
              <MantineRichTextEditor.Code />
            </MantineRichTextEditor.ControlsGroup>

            <MantineRichTextEditor.ControlsGroup>
              <MantineRichTextEditor.H1 />
              <MantineRichTextEditor.H2 />
              <MantineRichTextEditor.H3 />
              <MantineRichTextEditor.H4 />
            </MantineRichTextEditor.ControlsGroup>

            <MantineRichTextEditor.ControlsGroup>
              <MantineRichTextEditor.Blockquote />
              <MantineRichTextEditor.Hr />
              <MantineRichTextEditor.BulletList />
              <MantineRichTextEditor.OrderedList />
              <MantineRichTextEditor.Subscript />
              <MantineRichTextEditor.Superscript />
            </MantineRichTextEditor.ControlsGroup>

            <MantineRichTextEditor.ControlsGroup>
              <MantineRichTextEditor.Link />
              <MantineRichTextEditor.Unlink />
            </MantineRichTextEditor.ControlsGroup>

            <MantineRichTextEditor.ControlsGroup>
              <MantineRichTextEditor.AlignLeft />
              <MantineRichTextEditor.AlignCenter />
              <MantineRichTextEditor.AlignJustify />
              <MantineRichTextEditor.AlignRight />
            </MantineRichTextEditor.ControlsGroup>

            <MantineRichTextEditor.ControlsGroup>
              <MantineRichTextEditor.Undo />
              <MantineRichTextEditor.Redo />
            </MantineRichTextEditor.ControlsGroup>

            <MantineRichTextEditor.ControlsGroup>
              <button
                type="button"
                onClick={openImageModal}
                className="w-[26px] h-[26px] flex justify-center items-center
                           rounded-[4px] border-[#9093a4] border p-1"
              >
                <IconPhoto size={18} className="text-[#808496]" />
              </button>
            </MantineRichTextEditor.ControlsGroup>
          </MantineRichTextEditor.Toolbar>

          <MantineRichTextEditor.Content />
        </MantineRichTextEditor>

        {!autoSubmit && (
          <Button type="submit" className="grow mt-2">
            {t('Submit')}
          </Button>
        )}
      </form>

      <ChooseAttachmentModal
        isOpen={isImageModalOpened}
        close={closeImageModal}
        backendHost={backendHost}
        user={user}
        setUser={setUser}
        onChange={({ attachUrl }) => {
          if (editor) {
            editor.chain().focus().setImage({ src: attachUrl }).run();
          }
        }}
        type="image"
      />
    </>
  );
}
