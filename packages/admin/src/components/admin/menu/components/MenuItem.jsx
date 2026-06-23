import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Tooltip, Button } from '@mantine/core';
import ChangeParentModal from './ChangeParentModal.jsx';
import VisibilityControl from '../../../../common/auth/VisibilityControl.jsx';
import {
  IconArrowDown,
  IconArrowUp,
  IconLink,
  IconPencil,
  IconPlus,
  IconStack2,
  IconTrash,
} from '@tabler/icons-react';

const MenuItem = (props) => {
  const {
    item,
    moveItemUp,
    moveItemDown,
    changeParent,
    deleteItem,
    addChild,
    editItem,
    allItems,
    locales,
    pageContents,
  } = props;
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);
  const [showParentModal, setShowParentModal] = useState(false);

  // Check if an item is a child of another item (to prevent circular references)
  const isChildOf = (item, potentialParentId) => {
    if (!item.children) return false;
    return item.children.some(
      (child) => child.id === potentialParentId || isChildOf(child, potentialParentId),
    );
  };

  const getLanguageName = (localeCode) => {
    const locale = locales?.find((locale) => locale.iso_code === localeCode);
    return locale ? locale.name : localeCode;
  };

  const getLanguageFlag = (localeCode) => {
    const locale = locales?.find((locale) => locale.iso_code === localeCode);
    return locale ? locale.emoji_flag : '';
  };

  const getPathForLanguage = (localeCode) => {
    const translation = item.translations?.[localeCode];
    if (!translation) return '';

    // If using custom URL, return the URL from translation
    if (translation.use_custom_url) {
      return translation.url || '';
    }

    // If linked to page content, return the URL (should be page_content.slug from backend)
    if (translation.page_content_id) {
      const pageContent = pageContents?.find(
        (content) => content.id === translation.page_content_id,
      );
      return pageContent?.slug || '';
    }

    return '';
  };

  const getTitleForLanguage = (localeCode) => {
    const translation = item.translations?.[localeCode];
    if (!translation) return '';

    if (!translation.use_custom_url && translation.page_content_id && translation.use_page_title) {
      const pageContent = pageContents?.find(
        (content) => content.id === translation.page_content_id,
      );
      return pageContent?.title || '';
    }

    return translation.title || '';
  };

  const getAvailableLanguages = () => {
    // Return all languages that have translations in the menu item
    return Object.keys(item.translations || {});
  };

  return (
    <div className="mb-4">
      <Card
        shadow="sm"
        padding="sm"
        radius="md"
        withBorder
        className={`${isHovered ? 'border-blue-500' : ''}`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="flex items-center">
          <div className="flex-grow">
            <div className="text-sm text-gray-500 flex items-center">
              <IconLink size={16} className="mr-2" />
              <div className="flex">
                {getAvailableLanguages().map((localeCode) => {
                  const translation = item.translations[localeCode];
                  const path = getPathForLanguage(localeCode);
                  const title = getTitleForLanguage(localeCode);

                  return (
                    <div
                      key={localeCode}
                      className="mr-2 flex flex-col py-1 px-2 rounded"
                      title={getLanguageName(localeCode)}
                    >
                      <div className="flex items-center">
                        <span className="mr-1">{getLanguageFlag(localeCode)}</span>
                        <span className="mr-1 text-black text-sm font-semibold">{title}</span>
                      </div>
                      <div className="flex items-center">
                        {translation?.open_in_new_tab && (
                          <span className="mr-1 text-xs bg-gray-200 px-1 py-0.5 rounded">
                            New tab
                          </span>
                        )}
                        {path ? (
                          <span className="text-xs text-primary-main">{path}</span>
                        ) : (
                          <span className="text-xs text-gray-400 italic">{t('No link')}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <VisibilityControl
            roleIds={[
              'super_admin_role',
              'admin_role',
              'website_admin_role',
              'website_editor_role',
            ]}
            render={false}
          >
            <div
              className={`flex items-center ${
                isHovered ? 'opacity-100' : 'opacity-0'
              } transition-opacity`}
            >
              <Tooltip label={t('Move Up')} position="top" withArrow>
                <Button
                  variant="subtle"
                  size="xs"
                  className="mr-1"
                  onClick={() => moveItemUp(item.id)}
                >
                  <IconArrowUp size={16} />
                </Button>
              </Tooltip>
              <Tooltip label={t('Move Down')} position="top" withArrow>
                <Button
                  variant="subtle"
                  size="xs"
                  className="mr-1"
                  onClick={() => moveItemDown(item.id)}
                >
                  <IconArrowDown size={16} />
                </Button>
              </Tooltip>
              <Tooltip label={t('Edit')} position="top" withArrow>
                <Button variant="subtle" size="xs" className="mr-1" onClick={() => editItem(item)}>
                  <IconPencil size={16} />
                </Button>
              </Tooltip>
              <Tooltip label={t('Add Child')} position="top" withArrow>
                <Button
                  variant="subtle"
                  size="xs"
                  className="mr-1"
                  onClick={() => addChild(item.id)}
                >
                  <IconPlus size={16} />
                </Button>
              </Tooltip>
              <Tooltip label={t('Change Parent')} position="top" withArrow>
                <Button
                  variant="subtle"
                  size="xs"
                  className="mr-1"
                  onClick={() => setShowParentModal(true)}
                >
                  <IconStack2 size={16} />
                </Button>
              </Tooltip>
              <Tooltip label={t('Delete')} position="top" withArrow>
                <Button variant="subtle" color="red" size="xs" onClick={() => deleteItem(item.id)}>
                  <IconTrash size={16} />
                </Button>
              </Tooltip>
            </div>
          </VisibilityControl>
        </div>
      </Card>

      {item.children && item.children.length > 0 && (
        <div className="pl-8 border-l border-dashed border-gray-300 ml-4 mt-2">
          {item.children.map((child) => (
            <MenuItem
              key={child.id}
              item={child}
              moveItemUp={moveItemUp}
              moveItemDown={moveItemDown}
              changeParent={changeParent}
              deleteItem={deleteItem}
              addChild={addChild}
              editItem={editItem}
              allItems={allItems}
              locales={locales}
              pageContents={pageContents}
            />
          ))}
        </div>
      )}

      {/* Change Parent Modal */}
      <ChangeParentModal
        opened={showParentModal}
        onClose={() => setShowParentModal(false)}
        item={item}
        allItems={allItems}
        changeParent={changeParent}
        locales={locales}
        pageContents={pageContents}
        isChildOf={(child, parentId) => {
          // Check if child is a descendant of parentId
          const checkDescendant = (item, targetId) => {
            if (item.id === targetId) return true;
            return item.children && item.children.some((child) => checkDescendant(child, targetId));
          };
          return checkDescendant(child, parentId);
        }}
      />
    </div>
  );
};

export default MenuItem;
