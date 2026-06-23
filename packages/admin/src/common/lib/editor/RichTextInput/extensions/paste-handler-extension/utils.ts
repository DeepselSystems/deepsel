import type { Editor } from '@tiptap/core';

/**
 * Constants for paste handler attributes
 * BE CAREFUL TO EDIT THIS - IT AFFECTS OLDER DATA
 */
export const PASTE_HANDLER_ATTRIBUTES = {
  CONTAINER: 'data-paste-handler',
} as const;

/**
 * Represents a locale version of an uploaded attachment.
 * Callers must pass locale-version data (e.g. locale_versions[0] from the
 * upload response) — NOT the parent AttachmentModel, whose content_type field
 * is deprecated and null after the multilang refactoring. The name field must
 * be the parent attachment slug (AttachmentModel.name), used for Jinja
 * serialization in setEnhancedImage / setEmbedVideo / setEmbedAudio.
 */
interface AttachmentFile {
  name: string;
  content_type: string;
}

/**
 * Insert uploaded attachments into the editor
 * Handles different content types (image, video, audio)
 * @param {Array<AttachmentFile>} attachments - Array of uploaded attachment files with slug names
 * @param {Object} editor - TipTap editor instance
 */
export const insertAttachmentsToEditor = async (
  attachments: AttachmentFile[],
  editor: Editor,
): Promise<void> => {
  if (!attachments || attachments.length === 0 || !editor) {
    return;
  }

  const unknownAttachments: AttachmentFile[] = [];

  for (const attachment of attachments) {
    const fileType = attachment.content_type?.match(/^([^/]+)/)?.[0];
    let needAddLineBreak = true;

    switch (fileType) {
      case 'image': {
        if (editor.can().setEnhancedImage({ src: '', description: '' })) {
          editor
            .chain()
            .focus()
            .setEnhancedImage({
              src: attachment.name,
              description: '',
            })
            .run();
        } else {
          console.warn('EnhancedImage extension is not enabled. Cannot insert image');
        }
        break;
      }

      case 'video': {
        if (editor.can().setEmbedVideo({ src: '' })) {
          editor
            .chain()
            .focus()
            .setEmbedVideo({
              src: attachment.name,
            })
            .run();
        } else {
          console.warn('EmbedVideo extension is not enabled. Cannot insert video');
        }
        break;
      }

      case 'audio': {
        if (editor.can().setEmbedAudio({ src: '' })) {
          editor
            .chain()
            .focus()
            .setEmbedAudio({
              src: attachment.name,
            })
            .run();
        } else {
          console.warn('EmbedAudio extension is not enabled. Cannot insert audio');
        }
        break;
      }

      default: {
        unknownAttachments.push(attachment);
        needAddLineBreak = false;
        break;
      }
    }

    if (needAddLineBreak) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      editor
        .chain()
        .focus()
        .createParagraphNear()
        .insertContent([{ type: 'paragraph' }, { type: 'paragraph' }])
        .run();
    }
  }

  if (unknownAttachments.length) {
    if (editor.can().setEmbedFiles({ files: [] })) {
      editor
        .chain()
        .focus()
        .setEmbedFiles({
          files: unknownAttachments.map((attachment) => ({
            attachmentName: attachment.name,
            displayName: attachment.name.split('/').pop() || attachment.name,
          })),
        })
        .run();
    } else {
      console.warn('EmbedFiles extension is not enabled. Cannot insert unknown file');
    }
  }
};
