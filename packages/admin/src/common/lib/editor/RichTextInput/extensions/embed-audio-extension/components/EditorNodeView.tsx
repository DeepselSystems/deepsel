import React, { useCallback } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { IconTrash } from '@tabler/icons-react';
import { modals } from '@mantine/modals';
import { useTranslation } from 'react-i18next';
import { getAttachmentByNameRelativeUrl } from '@deepsel/cms-utils/common/utils';
import { EMBED_AUDIO_ATTRIBUTES, EMBED_AUDIO_CLASSES } from '../utils';
import clsx from 'clsx';

/**
 * EditorNodeView component for embed audio
 * Displays audio player with delete button on hover
 */
const EditorNodeView = ({ node, deleteNode }: NodeViewProps) => {
  const { t } = useTranslation();
  const { src } = node.attrs as { src: string };

  /**
   * Handle delete button click - removes the node
   */
  const handleDeleteClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (deleteNode) {
        modals.openConfirmModal({
          centered: true,
          title: <div className="text-lg font-semibold">{t('Delete Audio')}</div>,
          children: t('Are you sure you want to delete this audio?'),
          labels: { confirm: t('Delete'), cancel: t('Cancel') },
          onConfirm: deleteNode,
        });
      }
    },
    [deleteNode, t],
  );

  return (
    <NodeViewWrapper
      className={clsx(EMBED_AUDIO_CLASSES.WRAPPER, 'relative group my-4')}
      {...{ [EMBED_AUDIO_ATTRIBUTES.CONTAINER]: 'true' }}
    >
      {/* Hover Overlay */}
      <div
        className={clsx(
          'absolute w-full h-full top-0 left-0',
          'bg-gray-emperor rounded transition opacity-0 group-hover:opacity-50 z-10',
        )}
      />

      {/* Delete Button */}
      <div
        className={clsx(
          'transition opacity-0 group-hover:opacity-100',
          'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10',
        )}
      >
        <button
          onClick={handleDeleteClick}
          className={clsx(
            'p-3 rounded bg-red-500 text-white bg-opacity-90',
            'flex items-center justify-center shadow-lg transition-all duration-200 transform hover:scale-110',
          )}
          title={t('Delete Audio')}
        >
          <IconTrash size={24} />
        </button>
      </div>

      {/* Audio Player */}
      <div className={EMBED_AUDIO_CLASSES.AUDIO_CONTAINER}>
        <audio
          src={getAttachmentByNameRelativeUrl(src)}
          controls
          className={EMBED_AUDIO_CLASSES.AUDIO_CONTENT}
        >
          {t('Your browser does not support the audio tag.')}
        </audio>
      </div>
    </NodeViewWrapper>
  );
};

export default EditorNodeView;
