import React, { useCallback } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { IconEdit } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { getAttachmentByNameRelativeUrl } from '@deepsel/cms-utils/common/utils';
import clsx from 'clsx';
import type { GalleryAttachment, GalleryConfig } from '../index';

/** Fallback values when config fields are missing */
const DEFAULT_IMAGES_PER_ROW = 3;
const DEFAULT_GAP_PX = 4;

/**
 * React node view for the Gallery TipTap extension.
 * Renders a preview grid in the editor and fires an editGallery CustomEvent
 * on edit click so RichTextInput can open GalleryModal.
 */
const GalleryNodeView = ({ node, editor, updateAttributes }: NodeViewProps) => {
  const { t } = useTranslation();
  const { galleryId, config, attachments } = node.attrs as {
    galleryId: string | null;
    config: GalleryConfig;
    attachments: GalleryAttachment[];
  };

  const locale = editor.extensionManager.extensions.find((ext) => ext.name === 'gallery')?.options
    ?.locale as string | undefined;

  const imagesPerRow = config?.imagesPerRow ?? DEFAULT_IMAGES_PER_ROW;
  const gap = config?.gap ?? DEFAULT_GAP_PX;

  const handleEditClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      window.dispatchEvent(
        new CustomEvent('editGallery', {
          detail: {
            galleryId,
            config,
            attachments,
            updateGallery: (
              newAttrs: Partial<{
                galleryId: string | null;
                config: GalleryConfig;
                attachments: GalleryAttachment[];
              }>,
            ) => {
              updateAttributes(newAttrs);
            },
          },
        }),
      );
    },
    [galleryId, config, attachments, updateAttributes],
  );

  return (
    <NodeViewWrapper className="relative group my-4" data-type="gallery">
      {/* Edit button — visible on hover */}
      <button
        type="button"
        onClick={handleEditClick}
        className={clsx(
          'absolute top-2 right-2 z-10',
          'flex items-center gap-1 px-2 py-1 rounded text-xs font-medium',
          'bg-white border border-gray-300 shadow-sm cursor-pointer',
          'opacity-0 group-hover:opacity-100 transition-opacity duration-200',
        )}
      >
        <IconEdit size={12} />
        {t('Edit Gallery')}
      </button>

      {attachments.length === 0 ? (
        /* Empty state */
        <div
          className="p-8 bg-gray-100 rounded-md text-center text-gray-500 cursor-pointer"
          onClick={handleEditClick}
        >
          {t('Empty Gallery — click to edit')}
        </div>
      ) : (
        /*
         * Image grid.
         * gridTemplateColumns, gap, and maxWidth are dynamic (driven by config values),
         * so inline style is the acceptable exception per coding convention.
         */
        <div
          className="gallery-container"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${imagesPerRow}, 1fr)`,
            gap: `${gap}px`,
            ...(config?.maxWidth ? { maxWidth: `${config.maxWidth}px`, margin: '0 auto' } : {}),
          }}
        >
          {attachments.map((attachment, idx) => (
            <div key={`${attachment.name}-${idx}`} className="gallery-image-container">
              <img
                src={getAttachmentByNameRelativeUrl(attachment.name, locale)}
                alt={attachment.alt_text || ''}
                className={clsx('gallery-image w-full h-auto object-cover aspect-square', {
                  'rounded-md': config?.rounded,
                })}
              />
              {attachment.caption && (
                <div className="gallery-image-caption px-1 py-2 text-sm text-gray-500 text-center leading-snug break-words">
                  {attachment.caption}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </NodeViewWrapper>
  );
};

export default GalleryNodeView;
