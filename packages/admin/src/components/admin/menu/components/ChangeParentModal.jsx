import { useTranslation } from 'react-i18next';
import { Button, Modal } from '@mantine/core';
import { IconHome } from '@tabler/icons-react';

const ChangeParentModal = ({
  opened,
  onClose,
  item,
  allItems,
  changeParent,
  isChildOf,
  locales,
  pageContents,
}) => {
  const { t } = useTranslation();

  const getLanguageFlag = (localeCode) => {
    const locale = locales?.find((locale) => locale.iso_code === localeCode);
    return locale ? locale.emoji_flag : '';
  };

  const getTitleForLanguage = (menuItem, localeCode) => {
    const translation = menuItem.translations?.[localeCode];
    if (!translation) return '';

    if (!translation.use_custom_url && translation.page_content_id && translation.use_page_title) {
      const pageContent = pageContents?.find(
        (content) => content.id === translation.page_content_id,
      );
      return pageContent?.title || '';
    }

    return translation.title || '';
  };

  const getAvailableLanguages = (menuItem) => {
    return Object.keys(menuItem.translations || {});
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={<div className="font-bold">{t('Change Parent')}</div>}
      size="md"
    >
      <div className="p-4">
        <div className="mb-4">
          <Button
            variant="light"
            className="w-full mb-4"
            onClick={() => {
              changeParent(item.id, null).then((success) => {
                if (success) onClose();
              });
            }}
          >
            <IconHome size={16} className="mr-2" />
            {t('Move to Root Level')}
          </Button>
          <div className="flex flex-wrap justify-start gap-2">
            {allItems
              .filter((menuItem) => menuItem.id !== item.id && !isChildOf(item, menuItem.id))
              .map((menuItem) => (
                <div
                  key={menuItem.id}
                  className="w-full mb-2 p-3 border border-gray-300 rounded cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => {
                    changeParent(item.id, menuItem.id).then((success) => {
                      if (success) onClose();
                    });
                  }}
                >
                  <div className="flex flex-col w-full">
                    <div className="flex flex-wrap gap-2">
                      {getAvailableLanguages(menuItem).map((localeCode) => {
                        const title = getTitleForLanguage(menuItem, localeCode);
                        return (
                          <div
                            key={localeCode}
                            className="flex items-center bg-gray-100 px-2 py-1 rounded"
                          >
                            <span className="mr-1">{getLanguageFlag(localeCode)}</span>
                            <span className="text-sm font-medium">{title || t('No title')}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>

        <div className="flex justify-end mt-4">
          <Button variant="outline" onClick={onClose}>
            {t('Cancel')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default ChangeParentModal;
