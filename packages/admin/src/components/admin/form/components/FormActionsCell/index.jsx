import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExternalLinkAlt, faCopy, faChartBar } from '@fortawesome/free-solid-svg-icons';
import { CopyButton, ActionIcon, Tooltip, Menu } from '@mantine/core';
import NotificationState from '../../../../../common/stores/NotificationState.js';

/**
 * FormActionsCell component for displaying form action buttons
 * Handles both single and multiple locale scenarios
 * @param {Object} props
 * @param {Form} props.form - The form object
 * @returns {JSX.Element}
 */
const FormActionsCell = ({ form }) => {
  const { t } = useTranslation();
  const { notify } = NotificationState((state) => state);

  /**
   * Generate form URL for sharing with specific locale
   * @param {Form} form - The form object
   * @param {number} localeId - The specific locale ID to generate URL for
   * @returns {string} The form URL
   */
  const generateFormUrl = (form, localeId) => {
    if (!form?.published || !form?.contents?.length) return '';

    const selectedContent = form.contents.find((content) => content.locale_id === localeId);

    if (!selectedContent?.slug || !selectedContent?.locale?.iso_code) return '';

    return `${window.origin}/${selectedContent.locale.iso_code}/forms${selectedContent.slug}`;
  };

  /**
   * Generate statistics URL for specific locale
   * @param {Form} form - The form object
   * @param {number} localeId - The specific locale ID to generate URL for
   * @returns {string} The statistics URL
   */
  const generateStatisticsUrl = (form, localeId) => {
    if (!form?.published || !form?.contents?.length) return '';

    const selectedContent = form.contents.find((content) => content.locale_id === localeId);

    if (!selectedContent?.slug || !selectedContent?.locale?.iso_code) return '';

    return `${window.origin}/${selectedContent.locale.iso_code}/forms${selectedContent.slug}/statistics`;
  };

  /**
   * Handle copy action with notification
   * @param {Function} copyFn - The copy function from CopyButton
   * @param {string} localeName - The locale name for notification
   */
  const handleCopy = useCallback(
    (copyFn, localeName = '') => {
      copyFn();
      notify({
        message: localeName
          ? t('Form link copied for {{locale}}', { locale: localeName })
          : t('Form link copied successfully'),
        type: 'success',
      });
    },
    [notify, t],
  );

  const isPublished = form.published;
  const contents = form.contents || [];

  if (!isPublished || contents.length === 0) {
    return <div className="text-gray-400 text-sm">{t('Not published')}</div>;
  }

  return (
    <div className="flex gap-1">
      {contents.length === 1 ? (
        // Single locale - show direct buttons
        <>
          <Tooltip label={t('Go to form')}>
            <ActionIcon
              component="a"
              href={generateFormUrl(form, contents[0].locale_id)}
              target="_blank"
              rel="noopener noreferrer"
              variant="subtle"
              size="sm"
            >
              <FontAwesomeIcon icon={faExternalLinkAlt} size="sm" />
            </ActionIcon>
          </Tooltip>

          <Tooltip label={t('View statistics')}>
            <ActionIcon
              component="a"
              href={generateStatisticsUrl(form, contents[0].locale_id)}
              target="_blank"
              rel="noopener noreferrer"
              variant="subtle"
              size="sm"
            >
              <FontAwesomeIcon icon={faChartBar} size="sm" />
            </ActionIcon>
          </Tooltip>

          <CopyButton value={generateFormUrl(form, contents[0].locale_id)}>
            {({ copied, copy }) => (
              <Tooltip label={copied ? t('Copied') : t('Copy share link')}>
                <ActionIcon onClick={() => handleCopy(copy)} variant="subtle" size="sm">
                  <FontAwesomeIcon icon={faCopy} size="sm" />
                </ActionIcon>
              </Tooltip>
            )}
          </CopyButton>
        </>
      ) : (
        // Multiple locales - show dropdown menus
        <>
          <Menu shadow="md" width={200}>
            <Menu.Target>
              <Tooltip label={t('Go to form')}>
                <ActionIcon variant="subtle" size="sm">
                  <FontAwesomeIcon icon={faExternalLinkAlt} size="sm" />
                </ActionIcon>
              </Tooltip>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>{t('Select language')}</Menu.Label>
              {contents.map((content) => (
                <Menu.Item
                  key={content.locale_id}
                  component="a"
                  href={generateFormUrl(form, content.locale_id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  leftSection={
                    <span className="text-lg">{content.locale?.emoji_flag || '🏳️'}</span>
                  }
                >
                  {content.locale?.name || 'Unknown'}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>

          <Menu shadow="md" width={200}>
            <Menu.Target>
              <Tooltip label={t('View statistics')}>
                <ActionIcon variant="subtle" size="sm">
                  <FontAwesomeIcon icon={faChartBar} size="sm" />
                </ActionIcon>
              </Tooltip>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>{t('Select language')}</Menu.Label>
              {contents.map((content) => (
                <Menu.Item
                  key={content.locale_id}
                  component="a"
                  href={generateStatisticsUrl(form, content.locale_id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  leftSection={
                    <span className="text-lg">{content.locale?.emoji_flag || '🏳️'}</span>
                  }
                >
                  {content.locale?.name || 'Unknown'}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>

          <Menu shadow="md" width={200}>
            <Menu.Target>
              <Tooltip label={t('Copy share link')}>
                <ActionIcon variant="subtle" size="sm">
                  <FontAwesomeIcon icon={faCopy} size="sm" />
                </ActionIcon>
              </Tooltip>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>{t('Select language')}</Menu.Label>
              {contents.map((content) => (
                <CopyButton
                  key={content.locale_id}
                  value={generateFormUrl(form, content.locale_id)}
                >
                  {({ copied, copy }) => (
                    <Menu.Item
                      onClick={() => handleCopy(copy, content.locale?.name)}
                      leftSection={
                        <span className="text-lg">{content.locale?.emoji_flag || '🏳️'}</span>
                      }
                      rightSection={copied ? <span className=" text-xs">{t('Copied')}</span> : null}
                    >
                      {content.locale?.name || 'Unknown'}
                    </Menu.Item>
                  )}
                </CopyButton>
              ))}
            </Menu.Dropdown>
          </Menu>
        </>
      )}
    </div>
  );
};

export default FormActionsCell;
