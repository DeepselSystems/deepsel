import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Image,
  Loader,
  Modal,
  Skeleton,
  Text,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';

import { downloadFromAttachUrl } from '@deepsel/cms-utils';
import { useUpload } from '../../../hooks';
import type { User } from '../../../types';
import type { NotifyFn } from '../../../types';
import type { AttachmentFile } from '../../ChooseAttachmentModal';
import { Button } from '../../Button';
import { Masonry } from '../../Masonry';
import { TextInput } from '../../TextInput';
import { useStockImages } from '../hooks/useStockImages';
import type { StockImage } from '../hooks/useStockImages';
import { UNSPLASH_UTM } from '../constants/stockImages';
import { StockImageItem } from './StockImageItem';
import { IconDeviceFloppy, IconInfoCircle, IconPhotoPlus, IconSearch } from '@tabler/icons-react';

/**
 * Delay before hiding skeleton after image load (milliseconds)
 */
const IMAGE_LOAD_DISPLAY_DELAY_MS = 500;

interface SearchStockImagesProps {
  multiple?: boolean;
  onNewAttachment?: (attachment: AttachmentFile) => void;
  selectedImages?: AttachmentFile[];
  setSelectedImages?: React.Dispatch<React.SetStateAction<AttachmentFile[]>>;
  selectedImagesMap?: Record<string | number, AttachmentFile>;
  backendHost: string;
  user: User | null;
  setUser: (user: User | null) => void;
  /**
   * Organization id used for the `X-Organization-Id` header on uploads.
   * Passed down from EnhancedImageSelector.
   */
  organizationId?: number | null;
  /**
   * Callback to display toast/snackbar notifications (save errors, success).
   * Sourced from the consuming app's notification store
   * (e.g. `NotificationState.getState().notify`).
   * Passed down from EnhancedImageSelector.
   */
  notify?: NotifyFn;
}

/**
 * Stock image search panel that fetches from Pexels and allows cloning to the internal library
 */
export function SearchStockImages({
  multiple = false,
  onNewAttachment = () => {},
  selectedImagesMap = {},
  setSelectedImages,
  backendHost,
  user,
  setUser,
  organizationId,
  notify,
}: SearchStockImagesProps) {
  // Translation
  const { t } = useTranslation();

  const {
    prevSearchStrRef,
    searchQuery,
    setSearchQuery,
    images,
    setImages,
    loading,
    error,
    searchImages,
    loadMore,
    isOutOfData,
    trackDownload,
  } = useStockImages({ backendHost, setUser });

  // Selected image for preview modal
  const [selectedImage, setSelectedImage] = useState<StockImage | null>(null);

  // Loading states
  const [loaded, setLoaded] = useState(false);
  const [isCloningStockImage, setIsCloningStockImage] = useState(false);

  // Attachment query
  const { uploadFileModel } = useUpload({ backendHost, token: user?.token, organizationId });

  // Trigger a default search once on mount so the panel isn't empty.
  const didInitialSearchRef = useRef(false);
  useEffect(() => {
    if (didInitialSearchRef.current) return;
    didInitialSearchRef.current = true;
    searchImages(1, 'nature');
  }, [searchImages]);

  /**
   * Download image from URL, upload to the library, and notify parent
   */
  const handleCloneImage = useCallback(
    async (image: StockImage) => {
      try {
        // Set loading
        setIsCloningStockImage(true);

        // Fetch the image from URL with CORS mode
        const response = await fetch(image.src, {
          mode: 'cors',
        });

        if (!response.ok) {
          console.error('Failed to download image:', response.status);
          notify?.({
            type: 'error',
            message: 'Failed to clone this image',
          });
          return;
        }

        // Convert response to blob
        const blob = await response.blob();

        // Determine file extension based on MIME type
        let extension = 'jpg';
        const mimeType = blob.type || 'image/jpeg';

        if (mimeType.includes('png')) {
          extension = 'png';
        } else if (mimeType.includes('gif')) {
          extension = 'gif';
        } else if (mimeType.includes('webp')) {
          extension = 'webp';
        } else if (mimeType.includes('svg')) {
          extension = 'svg';
        }

        // Generate filename with correct extension
        const filename = image.title
          ? `${image.title.replace(/\.[^/.]+$/, '').replace(/ /g, '-')}.${extension}`
          : `stock-image-${Date.now()}.${extension}`;

        // Create File object from blob with correct MIME type
        const file = new File([blob], filename, {
          type: mimeType,
        });

        // Upload the file
        const attachmentResult = await uploadFileModel('attachment', [file]);
        const attachment = ((attachmentResult as AttachmentFile[])[0] ??
          null) as AttachmentFile | null;
        if (!attachment) return;

        trackDownload(image.download_location);

        onNewAttachment?.(attachment);
        setSelectedImage(null);
        setImages((prevState) => {
          const selectedImageIndex = prevState.findIndex((o) => o._id === image._id);
          if (selectedImageIndex >= 0) {
            prevState[selectedImageIndex] = {
              ...prevState[selectedImageIndex],
              _attachment: attachment,
            };
            return [...prevState];
          } else {
            return prevState;
          }
        });
        notify?.({
          type: 'success',
          message: t('The attachment image cloned successfully'),
        });
      } catch (error) {
        notify?.({
          type: 'error',
          message: (error as Error).message ?? String(error),
        });
        console.error('Error downloading stock image:', error);
      } finally {
        // Set loading
        setIsCloningStockImage(false);
      }
    },
    [notify, onNewAttachment, setImages, t, trackDownload, uploadFileModel],
  );

  /**
   * Trigger image search if the query has changed
   */
  const handleSearch = useCallback(() => {
    if (searchQuery && prevSearchStrRef.current !== searchQuery) {
      searchImages();
    }
  }, [prevSearchStrRef, searchImages, searchQuery]);

  return (
    <>
      <TextInput
        mb="md"
        label={t('Search stock images')}
        description={t('Enter keywords to search for free stock images')}
        placeholder={t('e.g., nature, business, technology...')}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onKeyPress={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            handleSearch();
          }
        }}
        rightSection={
          <UnstyledButton disabled={!searchQuery} onClick={handleSearch}>
            <IconSearch size={16} />
          </UnstyledButton>
        }
      />

      {/*region loading*/}
      {!images.length && loading && (
        <Box className="flex justify-center p-8">
          <Loader size="md" />
        </Box>
      )}
      {/*endregion loading*/}

      {/*region error message*/}
      {error && (
        <Text c="red" size="sm" mb="md">
          {error}
        </Text>
      )}
      {/*endregion error message*/}

      {/*region image list*/}
      {!!images.length && (
        <Box>
          <Masonry>
            {images.map((image, index) => (
              <StockImageItem
                key={index}
                withCheckbox={multiple}
                stockImage={image}
                onClick={() => {
                  setLoaded(false);
                  setSelectedImage(image);
                }}
                checked={!!selectedImagesMap[image._attachment?.id ?? '']}
                onCheckedChange={(checked) => {
                  if (image._attachment) {
                    if (checked) {
                      setSelectedImages?.((prevState) => [
                        ...prevState,
                        image._attachment as AttachmentFile,
                      ]);
                    } else {
                      setSelectedImages?.((prevState) => {
                        const imageIndex = prevState.findIndex(
                          (o) => o.id === image._attachment?.id,
                        );
                        return [
                          ...prevState.slice(0, imageIndex),
                          ...prevState.slice(imageIndex + 1),
                        ];
                      });
                    }
                  }
                }}
              />
            ))}
          </Masonry>

          {isOutOfData ? (
            <Box className="text-center">
              <Box className="inline-block text-center text-gray mb-6 mt-10 p-1 px-3 bg-gray-athens-gray rounded">
                {t('There are no more images available for this search')}
              </Box>
            </Box>
          ) : (
            <Box className="py-3 text-center">
              <Button variant="outline" onClick={loadMore} loading={loading}>
                {t('Load more')}
              </Button>
            </Box>
          )}
        </Box>
      )}
      {/*endregion image list*/}

      {/*region no images*/}
      {!loading && !error && !images.length && (
        <Box className="text-center space-y-3 px-6 py-16">
          <IconPhotoPlus size={16} className="text-gray-pale-sky" />
          <Text c="dimmed" size="sm">
            {t('No images found. Enter new keywords.')}
          </Text>
        </Box>
      )}
      {/*endregion no images*/}

      {/*region preview modal*/}
      <Modal
        centered
        zIndex={12000}
        size="lg"
        opened={!!selectedImage}
        onClose={() => setSelectedImage(null)}
        keepMounted={false}
        classNames={{ content: '!overflow-hidden' }}
        title={
          <Box>
            <b>{selectedImage?.title} </b>
            <>
              {selectedImage?.description && (
                <Tooltip keepMounted withArrow label={selectedImage.description}>
                  <IconInfoCircle
                    size={16}
                    className="text-gray-pale-sky transition opacity-50 hover:opacity-100"
                  />
                </Tooltip>
              )}
            </>
          </Box>
        }
      >
        {selectedImage?._attachment && (
          <Alert
            variant="light"
            color="blue"
            mb="md"
            icon={<IconDeviceFloppy size={16} />}
            title={t('This image has already been cloned to the system')}
          ></Alert>
        )}

        <Box className="h-[calc(100vh-20rem)] flex flex-col justify-between">
          <Box className="relative h-full pb-20 flex items-center justify-center">
            <Box
              className={clsx(
                '!absolute !inset-0 !mx-auto !w-full !h-full !pb-20',
                loaded ? '!hidden' : '',
              )}
            >
              <Skeleton className={clsx('!w-full !h-full')} />
            </Box>

            {!!selectedImage && (
              <Image
                src={selectedImage.src}
                alt={selectedImage.title}
                className={clsx('max-h-full w-auto !object-contain', loaded ? '' : '!hidden')}
                onLoad={() => setTimeout(() => setLoaded(true), IMAGE_LOAD_DISPLAY_DELAY_MS)}
              />
            )}
          </Box>

          <Box className="-mt-20 flex justify-between items-center">
            {selectedImage?.photographer_name ? (
              <Box className="text-xs text-gray-pale-sky">
                {t('Photo by')}{' '}
                <a
                  href={`${selectedImage.photographer_url ?? ''}${UNSPLASH_UTM}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  {selectedImage.photographer_name}
                </a>{' '}
                {t('on')}{' '}
                <a
                  href={`https://unsplash.com/${UNSPLASH_UTM}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Unsplash
                </a>
              </Box>
            ) : (
              <Box />
            )}
            <Box className="space-x-2">
              <Button
                disabled={!selectedImage || !loaded}
                variant="outline"
                onClick={() => {
                  downloadFromAttachUrl(selectedImage!.src);
                }}
              >
                {t('Download')}
              </Button>
              {!selectedImage?._attachment && (
                <Button
                  disabled={!selectedImage || !loaded}
                  variant="outline"
                  onClick={() => {
                    void handleCloneImage(selectedImage!);
                  }}
                  loading={isCloningStockImage}
                >
                  {t('Add to library and select it')}
                </Button>
              )}
            </Box>
          </Box>
        </Box>
      </Modal>
      {/*endregion preview modal*/}
    </>
  );
}
