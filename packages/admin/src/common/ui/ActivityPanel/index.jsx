import dayjs from 'dayjs';
import { useState, useEffect } from 'react';
import { getActivityUserName, getAttachmentByNameRelativeUrl } from '../../utils';
import { useTranslation } from 'react-i18next';
import { useDisclosure } from '@mantine/hooks';
import Button from '../Button';
import Switch from '../Switch';
import UserAvatar from '../UserAvatar';
import RichTextInput from '../RichTextInput';
import ImageViewModal from '../ImageViewModal';
import CreatedActivity from './CreatedActivity';
import UpdatedActivity from './UpdatedActivity';
import CommentedActivity from './CommentedActivity';
import useModel from '../../api/useModel';
import useAuthentication from '../../api/useAuthentication';
import BackendHostURLState from '../../stores/BackendHostURLState';
import CommentImages from './CommentImages';
import { IconList } from '@tabler/icons-react';

export default function ActivityPanel(props) {
  const { t } = useTranslation();
  const backendHost = BackendHostURLState((state) => state.backendHost);
  const {
    model,
    id,
    apiResource = 'activity',
    refreshKey = 1,
    canAddImage = true,
    canAddComment = true,
    externalUser = false,
  } = props;
  const { user } = useAuthentication();
  const query = useModel(apiResource, {
    autoFetch: false,
    orderBy: { field: 'created_at', direction: 'desc' },
    pageSize: 200,
    filters: [
      {
        field: 'target_model',
        operator: '=',
        value: model,
      },
      {
        field: 'target_id',
        operator: '=',
        value: id,
      },
    ],
  });
  const { data: items, get, create, loading } = query;

  const [isEditing, setIsEditing] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [commentImages, setCommentImages] = useState([]);
  const [selectedImage, setSelectedImage] = useState('');
  const [isImageViewModalOpened, { open: openImageViewModal, close: closeImageViewModal }] =
    useDisclosure(false);

  useEffect(() => {
    get();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, model, id]);

  const handleSubmitComment = async () => {
    // Create a temporary div to parse HTML and get text content
    const div = document.createElement('div');
    div.innerHTML = newComment;
    const textContent = div.textContent || div.innerText || '';

    if (textContent.trim() || commentImages.length) {
      await create({
        type: 'commented',
        content: newComment,
        is_internal: isInternal,
        user_id: user.id,
        target_model: model,
        target_id: id,
        external_user_data: externalUser
          ? JSON.stringify({
              name: user.name,
              username: user.username,
              id: user.id,
              avatar_url: getAttachmentByNameRelativeUrl(user.image?.name),
            })
          : null,
        meta_data: {
          images: commentImages,
        },
      });
    }
    setNewComment('');
    setIsEditing(false);
    setIsInternal(false);
    setCommentImages([]);
    await get();
  };

  const renderCommentInput = () => {
    if (isEditing) {
      return (
        <div className="flex flex-col gap-2">
          <RichTextInput
            value={newComment}
            canAddImage={canAddImage}
            onAddImageOverride={(image) => setCommentImages([...commentImages, image])}
            onChange={(value) => setNewComment(value)}
            placeholder={isInternal ? t('Write an internal comment...') : t('Write a comment...')}
            autoFocus
          />

          <div className="flex justify-between items-start gap-4">
            <CommentImages
              images={commentImages}
              onImageClick={(image) => {
                setSelectedImage(image);
                openImageViewModal();
              }}
              onImageRemove={(index) => {
                const newImages = [...commentImages];
                newImages.splice(index, 1);
                setCommentImages(newImages);
              }}
              allowRemove={true}
              maxColumns={6}
            />

            {/* Controls on the right */}
            <div className="flex items-center gap-2 ml-auto">
              {!externalUser && (
                <Switch
                  checked={isInternal}
                  onChange={(e) => setIsInternal(e.target.checked)}
                  label={t('Internal')}
                  size="sm"
                />
              )}
              <Button
                type="button"
                variant="transparent"
                onClick={() => {
                  setIsEditing(false);
                  setNewComment('');
                  setIsInternal(false);
                  setCommentImages([]);
                }}
              >
                {t('Cancel')}
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={!newComment.trim() && !commentImages.length}
                loading={loading}
                onClick={handleSubmitComment}
              >
                {t('Send')}
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        onClick={() => setIsEditing(true)}
        className="flex items-center gap-4 cursor-pointer group"
      >
        <UserAvatar user={user} backendHost={backendHost} size="md" className="flex-shrink-0" />
        <div className="flex-1 p-3 text-sm text-gray-500 bg-gray-100 rounded group-hover:bg-gray-50 border border-gray-300">
          {t('Write a comment...')}
        </div>
      </div>
    );
  };

  const renderActivityContent = (activity) => {
    switch (activity.type) {
      case 'created':
        return <CreatedActivity activity={activity} />;
      case 'updated':
        return <UpdatedActivity activity={activity} />;
      case 'commented':
        return <CommentedActivity activity={activity} />;
      default:
        return null;
    }
  };

  return (
    <div className="py-6">
      <div className="flex items-center mb-4">
        <Button
          type="button"
          variant="transparent"
          className="!px-0 flex items-center gap-2"
          onClick={() => get()}
          size="lg"
        >
          <IconList size={16} className="mr-2" />
          {t('Activities')}
        </Button>
      </div>

      <div className="space-y-8">
        {canAddComment && <div className="mb-4">{renderCommentInput()}</div>}

        {items.map((activity) => (
          <div key={activity.id} className="flex gap-4">
            <UserAvatar
              user={activity.user}
              externalUserData={activity.external_user_data}
              backendHost={backendHost}
              size="md"
              className="flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium text-gray-900">
                  {getActivityUserName(activity.user, activity.external_user_data)}
                </span>
                <span className="text-gray-500">
                  {dayjs(activity.created_at).format('HH:mm MM/DD/YYYY')}
                </span>
                {activity.type === 'commented' && activity.is_internal && (
                  <span className="text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded-full text-xs border border-yellow-200">
                    {t('Internal')}
                  </span>
                )}
              </div>
              <div className="mt-1 text-sm text-gray-800">{renderActivityContent(activity)}</div>
            </div>
          </div>
        ))}
      </div>
      <ImageViewModal
        isOpen={isImageViewModalOpened}
        close={closeImageViewModal}
        imageUrl={selectedImage}
      />
    </div>
  );
}
