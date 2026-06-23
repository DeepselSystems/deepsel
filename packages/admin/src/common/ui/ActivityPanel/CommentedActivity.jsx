import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDisclosure } from '@mantine/hooks';
import ImageViewModal from '../ImageViewModal';
import CommentImages from './CommentImages';

export default function CommentedActivity({ activity }) {
  const { t } = useTranslation();
  const [selectedImage, setSelectedImage] = useState('');
  const [isImageViewModalOpened, { open: openImageViewModal, close: closeImageViewModal }] =
    useDisclosure(false);

  return (
    <>
      {activity.is_internal ? t('added an internal comment') : t('commented')}
      <div
        className={`ml-0 mt-1 p-3 rounded ${
          activity.is_internal ? 'bg-yellow-50 border-2 border-blue-400' : 'bg-gray-100'
        }`}
      >
        <div
          className="text-sm whitespace-pre-wrap [&_img]:max-w-full [&_img]:max-h-[120px] [&_img]:object-cover [&_img]:cursor-pointer [&_img]:transition-transform [&_img]:duration-200 [&_img]:hover:scale-[1.02] [&_a]:text-blue-600 [&_a]:hover:text-blue-800 [&_a]:underline"
          dangerouslySetInnerHTML={{
            __html: activity.content.replace(
              /<a /g,
              '<a target="_blank" rel="noopener noreferrer" ',
            ),
          }}
        />
      </div>
      {activity.meta_data?.images && (
        <div className="mt-2">
          <CommentImages
            images={activity.meta_data.images}
            onImageClick={(image) => {
              setSelectedImage(image);
              openImageViewModal();
            }}
            allowRemove={false}
          />
        </div>
      )}
      <ImageViewModal
        isOpen={isImageViewModalOpened}
        close={closeImageViewModal}
        imageUrl={selectedImage}
      />
    </>
  );
}
