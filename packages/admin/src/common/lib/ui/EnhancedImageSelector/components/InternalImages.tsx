import React, { useMemo, useState, useEffect, useCallback, memo } from 'react';
import clsx from 'clsx';
import { AspectRatio, Box, Text, Checkbox, Skeleton, TextInput } from '@mantine/core';
import { useIntersection, useDebouncedValue } from '@mantine/hooks';
import { IconSearch } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import fromPairs from 'lodash/fromPairs';
import { IMAGE_MIME_TYPE } from '@mantine/dropzone';
import { AttachmentDropzone } from '../../AttachmentDropzone';
import { useModel } from '../../../hooks';
import { useUpload } from '../../../hooks';
import type { User } from '../../../types';
import type { NotifyFn } from '../../../types';
import type { AttachmentFile } from '../../ChooseAttachmentModal';
import { useDefaultLocale } from '../../../../hooks/useDefaultLocale';
import { useSelectedVersion } from '../../../../hooks/useSelectedVersion';
import { useAttachmentCardOverlay } from '../../../hooks/useAttachmentCardOverlay';
import { AttachmentPreview } from '../../AttachmentPreview';
import type { OrgLanguage } from '../../AttachmentPreview';
import { IconChecks, IconEdit, IconX } from '@tabler/icons-react';
import { Button } from '../../Button';

interface InternalImagesProps {
  multiple?: boolean;
  onSelect?: (attachmentImage: AttachmentFile) => void;
  attachmentImages: AttachmentFile[];
  setAttachmentImages?: React.Dispatch<React.SetStateAction<AttachmentFile[]>>;
  isImagesLoading?: boolean;
  selectedImages?: AttachmentFile[];
  setSelectedImages?: React.Dispatch<React.SetStateAction<AttachmentFile[]>>;
  backendHost: string;
  user: User | null;
  setUser: (user: User | null) => void;
  /**
   * Organization id used for the `X-Organization-Id` header on uploads.
   * Passed down from EnhancedImageSelector.
   */
  organizationId?: number | null;
  /**
   * Callback to display toast/snackbar notifications (upload errors, success).
   * Sourced from the consuming app's notification store
   * (e.g. `NotificationState.getState().notify`).
   * Passed down from EnhancedImageSelector.
   */
  notify?: NotifyFn;
  /** Active editor locale ID — passed as locale_id when uploading via the dropzone */
  currentLocaleId?: number | null;
  /** Called after a successful dropzone upload to close the parent modal */
  onClose?: () => void;
}

/** Props for the per-card ImageCard sub-component */
interface ImageCardProps {
  attachmentImage: AttachmentFile;
  defaultLocaleId: number | null;
  availableLanguages: OrgLanguage[];
  multiple: boolean;
  isEditMode: boolean;
  isSelected: boolean;
  /** Called with the attachment id when the card is selected */
  onSelect: (id: number | string) => void;
  setUser: (user: User | null) => void;
  notify?: NotifyFn;
  /** Called with the updated attachment when a locale version is uploaded */
  onVersionUploaded: (attachment: AttachmentFile) => void;
}

/**
 * Renders a single attachment card with locale switching, lazy-load, and
 * an "Upload for {lang}" overlay when the selected locale has no file yet.
 * Uses IntersectionObserver to defer rendering until the card enters the viewport.
 */
const ImageCard = memo(function ImageCard({
  attachmentImage,
  defaultLocaleId,
  availableLanguages,
  multiple,
  isEditMode,
  isSelected,
  onSelect,
  setUser,
  notify,
  onVersionUploaded,
}: ImageCardProps) {
  const { t } = useTranslation();

  // Track when the card enters the viewport so we can lazy-load the attachment preview.
  const { ref: intersectionRef, entry } = useIntersection({
    root: null,
    threshold: 0.1,
    rootMargin: '100px',
  });
  const [hasEntered, setHasEntered] = useState(false);

  /**
   * Track when the card enters the viewport so we can lazy-load the attachment preview.
   */
  useEffect(() => {
    if (entry?.isIntersecting && !hasEntered) {
      setHasEntered(true);
    }
  }, [entry?.isIntersecting, hasEntered]);

  const { selectedVersion, selectedLocaleId, setSelectedLocale } = useSelectedVersion(
    attachmentImage.locale_versions ?? [],
    defaultLocaleId,
  );

  const selectedLangName =
    availableLanguages.find((l) => l.id === selectedLocaleId)?.name ??
    selectedVersion?.locale?.name ??
    null;

  const handleVersionUploaded = useCallback(
    (attachment: AttachmentFile, _localeId: number) => onVersionUploaded(attachment),
    [onVersionUploaded],
  );

  const { overlay, fileInputElement } = useAttachmentCardOverlay({
    attachment: attachmentImage,
    selectedLocaleId,
    selectedLangName,
    setUser,
    notify,
    onVersionUploaded: handleVersionUploaded,
    t,
    isEditMode,
    hideSelectAction: multiple,
    onSelect: () => !isEditMode && onSelect(attachmentImage.id),
  });

  return (
    <Checkbox.Card
      withBorder
      radius="md"
      className="overflow-hidden h-full"
      component="div"
      value={String(attachmentImage.id)}
      ref={intersectionRef}
    >
      <Box className="relative">
        {fileInputElement}
        <Box
          className={clsx('absolute top-0 left-0 p-2 z-10', !multiple && !isEditMode && 'hidden')}
        >
          <Checkbox.Indicator size="md" className="!cursor-pointer" />
        </Box>

        {hasEntered ? (
          <AttachmentPreview
            attachment={attachmentImage}
            selectedLocaleId={selectedLocaleId}
            onSelectLocale={setSelectedLocale}
            defaultLocaleId={defaultLocaleId}
            availableLanguages={availableLanguages}
            overlay={overlay}
            aspectRatioClassName={clsx(
              'transition-all duration-200',
              isSelected ? 'border-3 border-gray' : 'hover:border-3 border-gray-westar',
            )}
          />
        ) : (
          <AspectRatio ratio={1} mx="auto">
            <Skeleton radius="md" animate />
          </AspectRatio>
        )}
      </Box>
    </Checkbox.Card>
  );
});

/**
 * Internal image selector with upload, lazy loading, and edit/delete capabilities.
 * Supports multi-lang attachments: each card shows a locale flag bar so the user
 * can switch between per-locale file versions before selecting.
 */
export function InternalImages({
  multiple = false,
  onSelect = () => {},
  attachmentImages,
  setAttachmentImages = () => {},
  isImagesLoading,
  selectedImages,
  setSelectedImages,
  backendHost,
  user,
  setUser,
  organizationId,
  notify,
  currentLocaleId,
  onClose,
}: InternalImagesProps) {
  const { t } = useTranslation();
  const { defaultLocaleId, availableLanguages } = useDefaultLocale();
  const { uploadFileModel } = useUpload({ backendHost, token: user?.token, organizationId });
  const { deleteWithConfirm } = useModel<AttachmentFile>(
    'attachment',
    { backendHost, user, setUser },
    { pageSize: null },
  );
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingImages, setEditingImages] = useState<AttachmentFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch] = useDebouncedValue(searchQuery, 300);

  const filteredImages = useMemo(() => {
    if (!debouncedSearch.trim()) return attachmentImages;
    const q = debouncedSearch.toLowerCase();
    return attachmentImages.filter(
      (img) =>
        img.name?.toLowerCase().includes(q) ||
        img.locale_versions?.some(
          (v) => v.name?.toLowerCase().includes(q) || v.alt_text?.toLowerCase().includes(q),
        ),
    );
  }, [attachmentImages, debouncedSearch]);

  const attachmentImagesMap = useMemo(
    () =>
      fromPairs(attachmentImages.map((o) => [o.id, o])) as Record<string | number, AttachmentFile>,
    [attachmentImages],
  );
  const checkboxValue = useMemo(
    () =>
      isEditMode
        ? editingImages.map((o) => String(o.id))
        : selectedImages?.map((o) => String(o.id)) || [],
    [editingImages, isEditMode, selectedImages],
  );
  const isSelectedAllEditing = useMemo(
    () => filteredImages.length > 0 && editingImages.length === filteredImages.length,
    [filteredImages.length, editingImages.length],
  );

  /** Handle checkbox change */
  const handleCheckboxChange = useCallback(
    (values: string[]) => {
      if (isEditMode) {
        setEditingImages(values.map((o) => attachmentImagesMap[Number(o)]));
      } else if (multiple) {
        setSelectedImages?.(values.map((o) => attachmentImagesMap[Number(o)]));
      }
    },
    [attachmentImagesMap, isEditMode, multiple, setSelectedImages],
  );

  /**
   * Handle file drop
   */
  const handleDropping = useCallback(
    async (files: File[]) => {
      if (files?.length) {
        setIsUploading(true);
        try {
          const newImageAttachments = (await uploadFileModel(
            'attachment',
            files,
            currentLocaleId != null ? { locale_id: currentLocaleId } : undefined,
          )) as AttachmentFile[];
          setAttachmentImages((prevState) => [...newImageAttachments, ...prevState]);
          notify?.({ message: t('Uploaded successfully'), type: 'success' });
          if (newImageAttachments[0]) {
            onSelect(newImageAttachments[0]);
          }
          onClose?.();
        } catch (err) {
          notify?.({ message: (err as Error).message, type: 'error' });
          console.error(err);
        } finally {
          setIsUploading(false);
        }
      }
    },
    [notify, onSelect, setAttachmentImages, t, uploadFileModel, currentLocaleId, onClose],
  );

  /**
   * Handle select all checkbox change
   */
  const handleSelectAll = useCallback(() => {
    setEditingImages(isSelectedAllEditing ? [] : filteredImages);
  }, [filteredImages, isSelectedAllEditing]);

  const handleCardSelect = useCallback(
    (id: number | string) => {
      const attachment = attachmentImagesMap[id];
      if (attachment) onSelect(attachment);
    },
    [attachmentImagesMap, onSelect],
  );

  const handleCardVersionUploaded = useCallback(
    (updated: AttachmentFile) => {
      setAttachmentImages((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      onSelect(updated);
    },
    [onSelect, setAttachmentImages],
  );

  const handleDelete = useCallback(() => {
    const deletingImageIds = editingImages.map((o) => o.id);
    if (deletingImageIds.length) {
      void deleteWithConfirm(deletingImageIds, () => {
        setEditingImages([]);
        setIsEditMode(false);
        setAttachmentImages((prevState) =>
          prevState.filter((o) => !deletingImageIds.includes(o.id)),
        );
      });
    }
  }, [deleteWithConfirm, editingImages, setAttachmentImages]);

  /**
   * Reset editing images when edit mode is disabled
   */
  useEffect(() => {
    if (!isEditMode) setEditingImages([]);
  }, [isEditMode]);

  return (
    <>
      <Box>
        {/*region dropzone*/}
        <div className="mb-4">
          <AttachmentDropzone
            onDrop={(files) => void handleDropping(files)}
            accept={IMAGE_MIME_TYPE}
            disabled={isImagesLoading || isUploading}
            imageMode
          />
        </div>
        {/*endregion dropzone*/}

        {/*region search*/}
        <TextInput
          placeholder={t('Search images...')}
          leftSection={<IconSearch size={16} />}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.currentTarget.value)}
          className="mb-3"
        />
        {/*endregion search*/}

        {/*region edit actions*/}
        <Box className="text-end my-4 mx-2 space-x-6">
          {isEditMode && !!editingImages?.length && (
            <Button
              variant="transparent"
              leftSection={<IconX size={16} />}
              className="!px-0"
              onClick={handleDelete}
            >
              {t('Delete')}
            </Button>
          )}
          {isEditMode && (
            <Button
              variant="transparent"
              leftSection={<IconChecks size={16} />}
              className="!px-0"
              onClick={handleSelectAll}
            >
              {isSelectedAllEditing ? t('Deselect all') : t('Select all')}
            </Button>
          )}
          <Button
            variant="transparent"
            leftSection={<IconEdit size={16} />}
            className="!px-0"
            onClick={() => setIsEditMode((prev) => !prev)}
          >
            {t('Toggle edit')}
          </Button>
        </Box>
        {/*endregion edit actions*/}

        {/*region images grid*/}
        <Checkbox.Group value={checkboxValue} onChange={handleCheckboxChange}>
          <Box className="grid grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3 items-start">
            {filteredImages.map((attachmentImage) => (
              <ImageCard
                key={attachmentImage.id}
                attachmentImage={attachmentImage}
                defaultLocaleId={defaultLocaleId}
                availableLanguages={availableLanguages}
                multiple={multiple}
                isEditMode={isEditMode}
                isSelected={checkboxValue.includes(String(attachmentImage.id))}
                onSelect={handleCardSelect}
                setUser={setUser}
                notify={notify}
                onVersionUploaded={handleCardVersionUploaded}
              />
            ))}
          </Box>
        </Checkbox.Group>
        {/*endregion images grid*/}

        {/*region empty state*/}
        {!isImagesLoading && !filteredImages.length && (
          <Box className="text-center space-y-3 px-6 py-16">
            <Text c="dimmed" size="sm">
              {debouncedSearch ? t('No images match your search.') : t('No images found.')}
            </Text>
          </Box>
        )}
        {/*endregion empty state*/}
      </Box>
    </>
  );
}
