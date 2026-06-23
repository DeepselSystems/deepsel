import React, { useCallback, useState } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { IconPencil, IconTrash } from '@tabler/icons-react';
import { modals } from '@mantine/modals';
import JumpMarksModal from './JumpMarksModal';
import { useTranslation } from 'react-i18next';
import { getVideoId } from '../utils';
import clsx from 'clsx';
import type { JumpMark, JumpMarkData } from '../types';

interface YoutubeJumpMarksAttributes {
  src: string;
  width: number;
  height: number;
  title: string;
  jumpMarks: JumpMark[];
  showJumpMarks: boolean;
}

/**
 * NodeView component for YouTube Jump Marks in editor mode
 * Displays YouTube video with jump marks and edit/delete buttons on hover
 */
const EditorNodeView = ({ node, updateAttributes, deleteNode }: NodeViewProps) => {
  const { t } = useTranslation();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { src, width, height, title, jumpMarks, showJumpMarks } =
    node.attrs as YoutubeJumpMarksAttributes;

  /**
   * Handle edit button click - opens modal directly
   */
  const handleEditClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsModalOpen(true);
  }, []);

  /**
   * Handle modal save - updates node attributes
   */
  const handleModalSave = useCallback(
    (data: JumpMarkData) => {
      updateAttributes(data);
      setIsModalOpen(false);
    },
    [updateAttributes],
  );

  /**
   * Handle modal close
   */
  const handleModalClose = useCallback(() => {
    setIsModalOpen(false);
  }, []);

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
          title: <div className="text-lg font-semibold ">{t('Delete YouTube Video')}</div>,
          children: t('Are you sure you want to delete this YouTube frame?'),
          labels: { confirm: t('Delete'), cancel: t('Cancel') },
          onConfirm: deleteNode,
        });
      }
    },
    [deleteNode, t],
  );

  /**
   * Get embed URL from YouTube URL
   */
  const getEmbedUrl = (url: string): string | null => {
    if (!url) return null;
    const videoId = getVideoId(url);
    if (!videoId) return url;
    return `https://www.youtube.com/embed/${videoId}`;
  };

  /**
   * Format time in seconds to MM:SS format
   */
  const formatTime = (seconds: number): string => {
    if (typeof seconds !== 'number' || isNaN(seconds) || seconds < 0) {
      return '00:00';
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  /**
   * Validate jump mark structure
   */
  const isValidJumpMark = (jumpMark: JumpMark): boolean => {
    return (
      jumpMark &&
      typeof jumpMark === 'object' &&
      typeof jumpMark.time === 'number' &&
      !isNaN(jumpMark.time) &&
      jumpMark.time >= 0 &&
      typeof jumpMark.label === 'string' &&
      jumpMark.label.trim().length > 0
    );
  };

  /**
   * Handle jump mark click
   */
  const handleJumpMarkClick = (time: number) => {
    const videoId = getVideoId(src);
    if (!videoId) return;

    const iframe = document.querySelector(`iframe[src*="${videoId}"]`);
    if (iframe && iframe instanceof HTMLIFrameElement) {
      const baseUrl = `https://www.youtube.com/embed/${videoId}`;
      iframe.src = `${baseUrl}?start=${Math.floor(time)}`;
    }
  };

  const embedUrl = getEmbedUrl(src);
  const validJumpMarks = (jumpMarks || []).filter(isValidJumpMark);

  return (
    <NodeViewWrapper
      className="youtube-jump-mark-wrapper relative group"
      data-youtube-jumpmarks="true"
      data-jump-marks={JSON.stringify(jumpMarks)}
      data-show-jump-marks={showJumpMarks.toString()}
      data-title={title}
      src={src}
      width={width}
      height={height}
    >
      {/* Edit Button - Only visible on hover */}
      <div
        className={clsx(
          'absolute w-full h-full top-0 left-0',
          'bg-gray-emperor rounded transition opacity-0 group-hover:opacity-50 group-hover:scale-x-[103%]',
        )}
      ></div>
      <div
        className={clsx(
          'transition opacity-0 group-hover:opacity-100',
          'absolute top-1/2 right-1/2 -translate-y-1/2 translate-x-1/2',
          'flex gap-3 items-center justify-center',
        )}
      >
        {/* Edit Button */}
        <button
          onClick={handleEditClick}
          className={clsx(
            'group-hover:opacity-100',
            'p-3 rounded bg-gray-ebony text-white bg-opacity-90',
            'flex items-center justify-center shadow-lg transition-all duration-200 transform hover:scale-110',
          )}
          title={t('Edit YouTube Jump Marks')}
        >
          <IconPencil size={24} />
        </button>

        {/* Delete Button */}
        <button
          onClick={handleDeleteClick}
          className={clsx(
            'group-hover:opacity-100',
            'p-3 rounded bg-red-500 text-white bg-opacity-90',
            'flex items-center justify-center shadow-lg transition-all duration-200 transform hover:scale-110',
          )}
          title={t('Delete YouTube Jump Marks')}
        >
          <IconTrash size={24} />
        </button>
      </div>

      {/* YouTube Video Embed */}
      <div className="youtube-embed-wrapper">
        <iframe
          width={width}
          height={height}
          src={embedUrl || undefined}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          className="w-full h-full"
        />
      </div>

      {/* Video Title */}
      {title && <div className="jump-mark-youtube-title">{title}</div>}

      {/* Jump Marks List */}
      {showJumpMarks && validJumpMarks.length > 0 && (
        <div className="jump-marks-list">
          {validJumpMarks.map((jumpMark, index) => (
            <div
              key={index}
              className="jump-mark-item"
              onClick={() => handleJumpMarkClick(jumpMark.time)}
              data-time={jumpMark.time}
            >
              <div className="jump-mark-time">{formatTime(jumpMark.time)}</div>
              <div className="jump-mark-content">
                <div className="jump-mark-label">{jumpMark.label}</div>
                {jumpMark.description &&
                  typeof jumpMark.description === 'string' &&
                  jumpMark.description.trim().length > 0 && (
                    <div className="jump-mark-description">{jumpMark.description}</div>
                  )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Modal */}
      <JumpMarksModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onSave={handleModalSave}
        initialData={{
          src,
          width,
          height,
          title,
          jumpMarks,
          showJumpMarks,
        }}
      />
    </NodeViewWrapper>
  );
};

export default EditorNodeView;
