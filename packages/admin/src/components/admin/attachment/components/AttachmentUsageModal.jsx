import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Modal, Text, Loader, ActionIcon, Tooltip, Badge } from '@mantine/core';
import { IconFileText, IconPhoto, IconLayout, IconExternalLink } from '@tabler/icons-react';
import useFetch from '../../../../common/api/useFetch.js';

/** Icon per content_type value returned by the usages endpoint. */
const CONTENT_TYPE_ICON = {
  page: IconLayout,
  blog_post: IconFileText,
  template: IconPhoto,
};

/** Human-readable label per content_type. */
const CONTENT_TYPE_LABEL = {
  page: 'Page',
  blog_post: 'Blog post',
  template: 'Template',
};

/**
 * Modal that lists every page / blog post / template embedding a given attachment
 * via {{ attachment('name') }}. Each row links directly to the editor pre-selecting
 * the locale tab that contains the reference.
 *
 * @param {{ attachment: object, opened: boolean, onClose: () => void }} props
 */
export function AttachmentUsageModal({ attachment, opened, onClose, localeId }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const {
    record,
    loading,
    error,
    get: getAttachmentUsages,
    setParams,
  } = useFetch(`attachment/${attachment?.id}/usages`, {
    autoFetch: false,
    params: localeId ? { locale_id: localeId } : null,
  });

  const usages = record?.usages ?? [];

  // Fetch usages when the modal opens
  useEffect(() => {
    if (!opened || !attachment?.id) return;
    setParams(localeId ? { locale_id: localeId } : null);
    getAttachmentUsages();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, attachment?.id, localeId, setParams]);

  /** Navigate to the editor pre-selecting the correct locale tab. */
  const handleEdit = (usage) => {
    onClose();
    navigate(`${usage.edit_path}?locale_id=${usage.locale_id}`);
  };

  /** Format locale object returned by the API into a display string. */
  const formatLocale = (locale) => {
    if (!locale) return null;
    return locale.name;
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Text>
          {t('Usage of')} <span className="text-primary-main font-bold">{attachment?.name}</span>
        </Text>
      }
      size="lg"
    >
      {loading && (
        <div className="flex justify-center py-8">
          <Loader size="sm" />
        </div>
      )}

      {error && (
        <Text c="red" size="sm">
          {t('Failed to load usages')}: {error}
        </Text>
      )}

      {!loading && !error && usages.length === 0 && (
        <Text c="dimmed" size="sm" className="py-4 text-center">
          {t('This attachment is not used in any content.')}
        </Text>
      )}

      {!loading && !error && usages.length > 0 && (
        <div className="flex flex-col gap-2">
          {usages.map((usage, idx) => {
            const Icon = CONTENT_TYPE_ICON[usage.content_type] ?? IconFileText;
            return (
              <div
                key={idx}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-md border border-gray-200 bg-gray-50"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Icon size={16} className="text-gray-500 shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <Text size="sm" fw={500} className="truncate">
                        {usage.title ??
                          `${CONTENT_TYPE_LABEL[usage.content_type] ?? usage.content_type} #${usage.parent_id}`}
                      </Text>
                      {usage.is_draft && (
                        <Badge size="xs" color="orange" variant="light">
                          {t('Draft')}
                        </Badge>
                      )}
                    </div>
                    <Text size="xs" c="dimmed">
                      {t(CONTENT_TYPE_LABEL[usage.content_type] ?? usage.content_type)}
                      {usage.locale && ` · ${formatLocale(usage.locale)}`}
                    </Text>
                  </div>
                </div>

                <Tooltip label={t('Open in editor')} withArrow>
                  <ActionIcon
                    variant="subtle"
                    color="blue"
                    onClick={() => handleEdit(usage)}
                    aria-label={t('Open in editor')}
                  >
                    <IconExternalLink size={16} />
                  </ActionIcon>
                </Tooltip>
              </div>
            );
          })}
        </div>
      )}

      {!loading && !error && (
        <Text size="xs" c="dimmed" className="mt-3 text-right">
          {t('{{count}} usage(s) found', { count: usages.length })}
        </Text>
      )}
    </Modal>
  );
}
