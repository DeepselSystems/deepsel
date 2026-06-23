import React, { useCallback, useMemo, useState } from 'react';
import { Modal, Tabs } from '@mantine/core';
import { useTranslation } from 'react-i18next';

import { useEffectOnce, useModel } from '../../hooks';
import type { User } from '../../types';
import type { NotifyFn } from '../../types';
import type { AttachmentFile } from '../ChooseAttachmentModal';
import { InternalImages } from './components/InternalImages';
import { SearchStockImages } from './components/SearchStockImages';

export interface EnhancedImageSelectorProps {
  onSelect?: (attachment: AttachmentFile) => void;
  multiple?: boolean;
  selectedImages?: AttachmentFile[];
  setSelectedImages?: React.Dispatch<React.SetStateAction<AttachmentFile[]>>;
  backendHost: string;
  user: User | null;
  setUser: (user: User | null) => void;
  /**
   * Organization id used for the `X-Organization-Id` header on uploads.
   * Pass from the consuming app's `OrganizationIdState` store.
   */
  organizationId?: number | null;
  /**
   * Callback to display toast/snackbar notifications.
   * Passed down to InternalImages and SearchStockImages sub-components.
   * Sourced from the consuming app's notification store
   * (e.g. `NotificationState.getState().notify`).
   */
  notify?: NotifyFn;
  /** Active editor locale ID — forwarded to dropzone uploads in InternalImages */
  currentLocaleId?: number | null;
  /** Called after a successful dropzone upload to close the parent modal */
  onClose?: () => void;
}

/**
 * Enhanced image selector with internal uploads and Unsplash stock image search
 */
export function EnhancedImageSelector({
  onSelect = () => {},
  multiple = false,
  selectedImages: selectedImagesProp,
  setSelectedImages: setSelectedImagesProp,
  backendHost,
  user,
  setUser,
  organizationId,
  notify,
  currentLocaleId,
  onClose,
}: EnhancedImageSelectorProps) {
  const { t } = useTranslation();

  const [internalSelectedImages, setInternalSelectedImages] = useState<AttachmentFile[]>([]);
  const selectedImages = selectedImagesProp || internalSelectedImages;
  const setSelectedImages = setSelectedImagesProp || setInternalSelectedImages;

  const { get: getAttachmentImages } = useModel<AttachmentFile>(
    'attachment',
    { backendHost, user, setUser },
    {
      pageSize: null,
      autoFetch: false,
      filters: [
        {
          field: 'locale_versions.content_type',
          operator: 'like',
          value: 'image%',
        },
      ],
    },
  );

  const [attachmentImages, setAttachmentImages] = useState<AttachmentFile[]>([]);
  const [isImagesLoading, setIsImagesLoading] = useState(true);

  const fetchAttachmentImages = useCallback(() => {
    setIsImagesLoading(true);
    void getAttachmentImages()
      .then((result) => {
        if (result) {
          setAttachmentImages(result.data);
        }
      })
      .finally(() => {
        setIsImagesLoading(false);
      });
  }, [getAttachmentImages]);

  useEffectOnce(() => {
    void fetchAttachmentImages();
  });

  const selectedImagesMap = useMemo(
    () =>
      Object.fromEntries(selectedImages.map((i) => [i.id, i])) as Record<
        string | number,
        AttachmentFile
      >,
    [selectedImages],
  );

  const handleStockAttachment = useCallback(
    (attachment: AttachmentFile) => {
      setAttachmentImages((prev) => [attachment, ...prev]);
      onSelect(attachment);
      if (!multiple) return;
      setSelectedImages((prev) =>
        prev.some((i) => i.id === attachment.id) ? prev : [...prev, attachment],
      );
    },
    [multiple, onSelect, setSelectedImages],
  );

  return (
    <div className="!h-[calc(100vh-20rem)] overflow-y-auto">
      <Tabs defaultValue="internal" keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="internal">{t('Library')}</Tabs.Tab>
          <Tabs.Tab value="stock">{t('Free stock photos (Unsplash)')}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="internal">
          <InternalImages
            multiple={multiple}
            onSelect={onSelect}
            attachmentImages={attachmentImages}
            setAttachmentImages={setAttachmentImages}
            isImagesLoading={isImagesLoading}
            selectedImages={selectedImages}
            setSelectedImages={setSelectedImages}
            backendHost={backendHost}
            user={user}
            setUser={setUser}
            organizationId={organizationId}
            notify={notify}
            currentLocaleId={currentLocaleId}
            onClose={onClose}
          />
        </Tabs.Panel>

        <Tabs.Panel value="stock">
          <SearchStockImages
            multiple={multiple}
            onNewAttachment={handleStockAttachment}
            selectedImages={selectedImages}
            setSelectedImages={setSelectedImages}
            selectedImagesMap={selectedImagesMap}
            backendHost={backendHost}
            user={user}
            setUser={setUser}
            organizationId={organizationId}
            notify={notify}
          />
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}

export interface EnhancedImageSelectorModalProps extends EnhancedImageSelectorProps {
  opened: boolean;
  setOpened?: (value: boolean) => void;
}

/**
 * Modal wrapper around EnhancedImageSelector
 */
export function EnhancedImageSelectorModal({
  opened,
  setOpened = () => {},
  ...props
}: EnhancedImageSelectorModalProps) {
  const { t } = useTranslation();

  return (
    <>
      <Modal
        centered
        size="100%"
        opened={opened}
        closeOnEscape={false}
        closeOnClickOutside={false}
        onClose={() => setOpened(false)}
        title={t('Select image')}
        zIndex={11000}
      >
        <EnhancedImageSelector {...props} onClose={() => setOpened(false)} />
      </Modal>
    </>
  );
}
