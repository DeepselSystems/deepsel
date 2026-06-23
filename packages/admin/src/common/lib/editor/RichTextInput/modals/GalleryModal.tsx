import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Group, Modal, Text, TextInput } from '@mantine/core';
import { IconArrowDown, IconArrowUp, IconEdit, IconPhoto, IconTrash } from '@tabler/icons-react';
import { Button } from '../../../ui';
import { Checkbox } from '../../../ui';
import { getAttachmentByNameRelativeUrl } from '@deepsel/cms-utils/common/utils';
import { EnhancedImageSelector } from '../../../ui';
import type { User } from '../../../types';

/**
 * Gallery layout configuration
 */
interface GalleryConfig {
  imagesPerRow: number;
  gap: number;
  maxWidth: number | null;
  rounded: boolean;
}

/**
 * Attachment item in a gallery
 */
export interface GalleryAttachment {
  id?: string | number;
  name: string;
  alt_text?: string;
  caption?: string;
}

/**
 * Data passed to onSave callback
 */
export interface GalleryModalSaveData {
  galleryId?: string | number | null;
  config: GalleryConfig;
  attachments: GalleryAttachment[];
}

export interface GalleryModalProps {
  /** Controls whether the modal is visible. */
  isOpen: boolean;

  /** Callback to close the modal. */
  close: () => void;

  /** ID of the gallery being edited (null for new gallery). */
  galleryId?: string | number | null;

  /** Initial gallery configuration. */
  initialConfig?: GalleryConfig;

  /** Initial list of attachments. */
  initialAttachments?: GalleryAttachment[];

  /** Called when the user saves the gallery. */
  onSave: (data: GalleryModalSaveData) => void;

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

  /** ISO code of the active editor localeISOCode (e.g. "en", "fr"). Passed to getAttachmentByNameRelativeUrl. */
  localeISOCode?: string;
}

/**
 * Default gallery configuration
 */
const DEFAULT_GALLERY_CONFIG: GalleryConfig = {
  imagesPerRow: 3,
  gap: 4,
  maxWidth: null,
  rounded: true,
};

/**
 * Modal for creating and editing image galleries.
 *
 * Requires backendHost, user, setUser props
 * (sourced from BackendHostURLState / UserState in the consuming app).
 */
export function GalleryModal({
  isOpen,
  close,
  galleryId = null,
  initialConfig = DEFAULT_GALLERY_CONFIG,
  initialAttachments = [],
  onSave,
  backendHost,
  user,
  setUser,
  localeISOCode,
}: GalleryModalProps) {
  const { t } = useTranslation();

  const [config, setConfig] = useState<GalleryConfig>(initialConfig);
  const [selectedAttachments, setSelectedAttachments] = useState<GalleryAttachment[]>([]);
  const [editingCaption, setEditingCaption] = useState<string | number | null>(null);
  const [newCaption, setNewCaption] = useState('');

  // Set initial values when modal opens - only on first open
  useEffect(() => {
    if (isOpen) {
      if (initialAttachments && initialAttachments.length > 0) {
        setSelectedAttachments(initialAttachments);
      } else if (selectedAttachments.length === 0) {
        setSelectedAttachments([]);
      }
      setConfig(initialConfig);
    }
  }, [isOpen]);

  /**
   * Move attachment up or down in the list
   */
  const moveAttachment = (index: number, direction: 'up' | 'down') => {
    const newOrder = [...selectedAttachments];
    if (direction === 'up' && index > 0) {
      [newOrder[index], newOrder[index - 1]] = [newOrder[index - 1], newOrder[index]];
      setSelectedAttachments(newOrder);
    } else if (direction === 'down' && index < selectedAttachments.length - 1) {
      [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
      setSelectedAttachments(newOrder);
    }
  };

  /**
   * Remove attachment from the list
   */
  const removeAttachment = (index: number) => {
    const newOrder = [...selectedAttachments];
    newOrder.splice(index, 1);
    setSelectedAttachments(newOrder);
  };

  /**
   * Update caption for a specific attachment
   */
  const handleCaptionUpdate = (attachmentId: string | number, caption: string) => {
    setSelectedAttachments((prev) =>
      prev.map((attachment, index) => {
        const currentId = attachment.id || attachment.name || index;
        return currentId === attachmentId ? { ...attachment, caption: caption.trim() } : attachment;
      }),
    );
  };

  /**
   * Save gallery and close modal
   */
  const handleSave = () => {
    if (galleryId) {
      onSave({ galleryId, config, attachments: selectedAttachments });
    } else {
      onSave({ config, attachments: selectedAttachments });
    }
    close();
  };

  return (
    <>
      <Modal
        opened={isOpen}
        onClose={close}
        title={
          <div className="flex items-center">
            <IconPhoto size={18} className="mr-2" />
            <Text size="lg" fw={500}>
              {galleryId ? t('Edit Gallery') : t('Create Gallery')}
            </Text>
          </div>
        }
        size="100%"
        zIndex={11000}
      >
        <div className="pt-2">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Left side - Image selection */}
            <div className="w-full md:w-1/2">
              <EnhancedImageSelector
                backendHost={backendHost}
                user={user}
                setUser={setUser}
                multiple
                selectedImages={
                  selectedAttachments as Parameters<
                    typeof EnhancedImageSelector
                  >[0]['selectedImages']
                }
                setSelectedImages={
                  setSelectedAttachments as Parameters<
                    typeof EnhancedImageSelector
                  >[0]['setSelectedImages']
                }
              />
            </div>

            {/* Right side - Preview */}
            <div className="w-full md:w-1/2 md:sticky md:top-0">
              {/* Quick settings above preview panel */}
              <div className="mb-3 border border-gray-300 rounded-md p-3 bg-gray-50">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{t('Images per row')}:</span>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4].map((num) => (
                        <button
                          key={num}
                          className={`w-8 h-8 cursor-pointer flex items-center justify-center rounded ${config.imagesPerRow === num ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
                          onClick={() => setConfig({ ...config, imagesPerRow: num })}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center">
                    <Checkbox
                      checked={config.rounded}
                      onChange={() => setConfig({ ...config, rounded: !config.rounded })}
                      className="cursor-pointer"
                    />
                    <span className="ml-2 text-sm">{t('Rounded corners')}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{t('Gap')}:</span>
                    <div className="flex gap-1">
                      {[2, 4, 8, 12].map((num) => (
                        <button
                          key={num}
                          className={`w-8 h-8 cursor-pointer flex items-center justify-center rounded ${config.gap === num ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
                          onClick={() => setConfig({ ...config, gap: num })}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Preview panel with fixed width */}
              <div className="border border-gray-300 rounded-md p-4 h-full">
                <h3 className="text-lg font-medium mb-4">{t('Gallery Preview')}</h3>
                <div
                  className="flex flex-wrap"
                  style={{
                    gap: `${config.gap}px`,
                  }}
                >
                  {selectedAttachments.map((attachment, index) => {
                    const widthClass =
                      config.imagesPerRow === 1
                        ? 'w-full'
                        : config.imagesPerRow === 2
                          ? 'w-[calc(50%-4px)]'
                          : config.imagesPerRow === 3
                            ? 'w-[calc(33.333%-4px)]'
                            : 'w-[calc(25%-4px)]';
                    return (
                      <div key={attachment.id || attachment.name || index} className={widthClass}>
                        {/* Image container with hover effects */}
                        <div className="relative group">
                          <img
                            src={getAttachmentByNameRelativeUrl(attachment.name, localeISOCode)}
                            alt={attachment.alt_text || ''}
                            className="group-hover:blur-xs transition-all duration-200"
                            style={{
                              width: '100%',
                              height: 'auto',
                              objectFit: 'cover',
                              aspectRatio: '1 / 1',
                              borderRadius: config.rounded ? '6px' : '0',
                            }}
                          />

                          {/* Overlay with centered buttons */}
                          <div className="absolute inset-0 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-black/20 flex items-center justify-center p-1">
                            <div className="flex flex-wrap gap-1 justify-center">
                              <button
                                onClick={() => {
                                  const attachmentId = attachment.id || attachment.name || index;
                                  setEditingCaption(attachmentId);
                                  setNewCaption(attachment.caption || '');
                                }}
                                className="w-7 h-7 rounded-full bg-white/80 flex items-center justify-center hover:bg-white"
                                title="Edit Caption"
                              >
                                <IconEdit size={18} className="text-gray-700" />
                              </button>
                              <button
                                className={`w-7 h-7 rounded-full bg-white/80 flex items-center justify-center ${index === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white'}`}
                                onClick={() => moveAttachment(index, 'up')}
                                disabled={index === 0}
                              >
                                <IconArrowUp size={18} className="text-gray-700" />
                              </button>
                              <button
                                className={`w-7 h-7 rounded-full bg-white/80 flex items-center justify-center ${index === selectedAttachments.length - 1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white'}`}
                                onClick={() => moveAttachment(index, 'down')}
                                disabled={index === selectedAttachments.length - 1}
                              >
                                <IconArrowDown size={18} className="text-gray-700" />
                              </button>
                              <button
                                className="w-7 h-7 rounded-full bg-white/80 flex items-center justify-center hover:bg-white hover:text-red-500"
                                onClick={() => removeAttachment(index)}
                              >
                                <IconTrash size={18} className="text-gray-700" />
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Caption outside the image container */}
                        {attachment.caption && (
                          <div
                            style={{
                              padding: '8px 4px',
                              fontSize: '14px',
                              color: '#666',
                              textAlign: 'center',
                              lineHeight: '1.4',
                              wordWrap: 'break-word',
                            }}
                          >
                            {attachment.caption}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {selectedAttachments.length === 0 && (
                    <div className="w-full text-center p-4 bg-gray-100 text-gray-500 rounded-md">
                      {t('No images selected')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <Group justify="flex-end" mt="md">
          <Button variant="outline" onClick={close}>
            {t('Cancel')}
          </Button>
          <Button onClick={handleSave}>{t('Save')}</Button>
        </Group>
      </Modal>

      {/* Caption editing modal */}
      <Modal
        opened={!!editingCaption}
        onClose={() => setEditingCaption(null)}
        title={t('Edit Caption')}
        zIndex={11000}
      >
        <TextInput
          value={newCaption}
          onChange={(e) => setNewCaption(e.target.value)}
          placeholder={t('Enter caption')}
        />
        <Group justify="flex-end" mt="md">
          <Button variant="outline" onClick={() => setEditingCaption(null)}>
            {t('Cancel')}
          </Button>
          <Button
            onClick={() => {
              if (editingCaption !== null) {
                handleCaptionUpdate(editingCaption, newCaption);
              }
              setEditingCaption(null);
            }}
          >
            {t('Save')}
          </Button>
        </Group>
      </Modal>
    </>
  );
}
