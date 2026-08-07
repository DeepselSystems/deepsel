import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import OrganizationIdState from '../../../common/stores/OrganizationIdState.js';
import useModel from '../../../common/api/useModel.jsx';
import useFetch from '../../../common/api/useFetch.js';
import NotificationState from '../../../common/stores/NotificationState.js';
import { LoadingOverlay } from '@mantine/core';
import Button from '../../../common/ui/Button.jsx';
import { useDisclosure } from '@mantine/hooks';
import { Helmet } from 'react-helmet';
import H1 from '../../../common/ui/H1.jsx';

// Import components
import MenuItem from './components/MenuItem.jsx';
import EditMenuItemModal from './components/EditMenuItemModal.jsx';

// Import utilities
import { buildMenuTree, isValidUrl } from './utils/menuUtils.js';

import VisibilityControl from '../../../common/auth/VisibilityControl.jsx';
import { IconPlus } from '@tabler/icons-react';
import useShowSiteSelector from '../../../common/hooks/useShowSiteSelector.js';

/**
 * Spacing between sibling menu item positions. Leaves room to insert an item
 * between two siblings later by averaging their positions, instead of
 * renumbering the whole level — matches the backend's POSITION_STEP in
 * apps/cms/routers/menu.py, which renumbers a level if gaps ever get too tight.
 */
const POSITION_STEP = 1000;

// Main Menu Tree Component
export default function MenuTree() {
  useShowSiteSelector();
  const { t } = useTranslation();
  const { organizationId } = OrganizationIdState();
  const { notify } = NotificationState();

  const [menuItems, setMenuItems] = useState([]);
  const [menuItemsMap, setMenuItemsMap] = useState({});
  const [newItemParentId, setNewItemParentId] = useState(null);
  const [editingItem, setEditingItem] = useState(null);

  const [opened, { open, close }] = useDisclosure(false);
  const [editOpened, { open: openEdit, close: closeEdit }] = useDisclosure(false);

  // Fetch locales
  const { data: locales } = useModel('locale', {
    autoFetch: true,
    pageSize: null, // Get all locales
  });

  // Page search functionality
  const pagesQuery = useModel('page', {
    autoFetch: true,
    searchFields: ['contents.slug', 'contents.title'],
    pageSize: 5,
  });

  // Fetch menu items
  const { data, loading, error, get, setFilters } = useModel('menu', {
    autoFetch: true,
    pageSize: null, // Get all menu items
    filters: organizationId
      ? [
          {
            field: 'organization_id',
            operator: '=',
            value: organizationId,
          },
        ]
      : [],
  });

  // Update filters when organizationId changes
  useEffect(() => {
    setFilters(
      organizationId
        ? [
            {
              field: 'organization_id',
              operator: '=',
              value: organizationId,
            },
          ]
        : [],
    );
  }, [organizationId, setFilters]);

  const pageContentIds = useMemo(() => {
    const ids = new Set();
    data?.forEach((item) => {
      if (item.translations) {
        Object.values(item.translations).forEach((translation) => {
          if (!translation.use_custom_url && translation.page_content_id) {
            ids.add(translation.page_content_id);
          }
        });
      }
    });
    return Array.from(ids);
  }, [data]);

  const { data: pageContents, get: getPageContents } = useModel('page_content', {
    autoFetch: false,
    pageSize: null,
  });

  useEffect(() => {
    if (pageContentIds.length > 0) {
      void getPageContents({
        search: { AND: [{ field: 'id', operator: 'in', value: pageContentIds }], OR: [] },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageContentIds]);

  // Create, update and delete functions
  const { create, update, deleteWithConfirm } = useModel('menu');

  // Bulk position/parent update for reordering — see POSITION_STEP above
  const { post: reorderMenuItemsRequest } = useFetch('menu/reorder', {
    autoFetch: false,
  });

  // Update menu items when data changes
  useEffect(() => {
    if (data) {
      // Handle both array and object with data property
      const menuData = Array.isArray(data) ? data : data?.data || [];
      const { rootItems, itemMap } = buildMenuTree(menuData);
      setMenuItems(rootItems);
      setMenuItemsMap(itemMap);
    }
  }, [data]);

  /**
   * Sends the given {id, parent_id, position} changes to the backend in one
   * transaction, then refreshes. Only items that actually moved need to be
   * included — see POSITION_STEP above for why a swap only needs 2 items and
   * a single move only needs 1.
   */
  const applyReorder = async (items) => {
    await reorderMenuItemsRequest({ items });
    await get();
  };

  // Position for a new/moved item appended to the end of a parent's children
  const getNextPosition = (parentId) => {
    const siblings = (data || []).filter((menuItem) => menuItem.parent_id === parentId);
    if (siblings.length === 0) return POSITION_STEP;
    return Math.max(...siblings.map((sibling) => sibling.position)) + POSITION_STEP;
  };

  // Move item up in the list — swaps position with the previous sibling
  const moveItemUp = async (itemId) => {
    try {
      const item = menuItemsMap[itemId];
      if (!item) return;

      // Find siblings (items with the same parent)
      const siblings = data
        .filter((menuItem) => menuItem.parent_id === item.parent_id)
        .sort((a, b) => a.position - b.position);

      const currentIndex = siblings.findIndex((sibling) => sibling.id === itemId);

      // If already at the top, do nothing
      if (currentIndex <= 0) return;

      const prevSibling = siblings[currentIndex - 1];

      await applyReorder([
        { id: item.id, parent_id: item.parent_id, position: prevSibling.position },
        { id: prevSibling.id, parent_id: prevSibling.parent_id, position: item.position },
      ]);
    } catch (error) {
      console.error('Error moving item up:', error);
      notify({ message: t('Failed to move menu item'), type: 'error' });
    }
  };

  // Move item down in the list — swaps position with the next sibling
  const moveItemDown = async (itemId) => {
    try {
      const item = menuItemsMap[itemId];
      if (!item) return;

      // Find siblings (items with the same parent)
      const siblings = data
        .filter((menuItem) => menuItem.parent_id === item.parent_id)
        .sort((a, b) => a.position - b.position);

      const currentIndex = siblings.findIndex((sibling) => sibling.id === itemId);

      // If already at the bottom, do nothing
      if (currentIndex >= siblings.length - 1 || currentIndex === -1) return;

      const nextSibling = siblings[currentIndex + 1];

      await applyReorder([
        { id: item.id, parent_id: item.parent_id, position: nextSibling.position },
        { id: nextSibling.id, parent_id: nextSibling.parent_id, position: item.position },
      ]);
    } catch (error) {
      console.error('Error moving item down:', error);
      notify({ message: t('Failed to move menu item'), type: 'error' });
    }
  };

  // Change parent of an item — appends it to the end of the new parent's
  // children. Positions are gap-based (see POSITION_STEP), so the old and
  // new parent's other siblings keep their existing positions unchanged;
  // only the moved item needs an update.
  const changeParent = async (itemId, newParentId) => {
    try {
      const item = menuItemsMap[itemId];
      if (!item) {
        notify({ message: t('Menu item not found'), type: 'error' });
        return false;
      }

      await applyReorder([
        { id: itemId, parent_id: newParentId, position: getNextPosition(newParentId) },
      ]);

      notify({
        message: t('Menu item parent changed successfully'),
        type: 'success',
      });

      // Note: The modal is closed by the component that calls this function
      return true; // Return success
    } catch (error) {
      console.error('Error changing parent:', error);
      notify({ message: t('Failed to change menu item parent'), type: 'error' });
      return false; // Return failure
    }
  };

  // Delete a menu item. Positions are gap-based (see POSITION_STEP), so
  // remaining siblings stay correctly ordered without renumbering.
  const deleteItem = async (id) => {
    try {
      const item = menuItemsMap[id];
      if (!item) return;

      // Use deleteWithConfirm to show a confirmation dialog before deleting
      deleteWithConfirm(
        [id],
        async () => {
          notify({
            message: t('Menu item deleted successfully'),
            type: 'success',
          });

          await get();
        },
        (error) => {
          console.error('Error deleting item:', error);
          notify({ message: t('Failed to delete menu item'), type: 'error' });
        },
      );
    } catch (error) {
      console.error('Error deleting item:', error);
      notify({ message: t('Failed to delete menu item'), type: 'error' });
    }
  };

  // Handle save from modal (create or update)
  const handleModalSave = async (id, data, action) => {
    try {
      if (action === 'create') {
        // Validate translations
        const translations = data.translations || {};
        let hasInvalidTranslationUrl = false;
        Object.values(translations).forEach((translation) => {
          if (translation.url && !isValidUrl(translation.url)) {
            hasInvalidTranslationUrl = true;
          }
        });

        if (hasInvalidTranslationUrl) {
          notify({
            message: t('Translated URLs must start with "/" or "http"'),
            type: 'error',
          });
          return;
        }

        // Append the item to the end of its parent's children
        await create({
          ...data,
          organization_id: organizationId,
          position: getNextPosition(data.parent_id),
          active: true,
        });

        notify({ message: t('Menu item added successfully'), type: 'success' });
        setNewItemParentId(null);
      } else if (action === 'update') {
        // Update existing item
        const item = menuItemsMap[id];
        if (!item) return;

        await update({
          ...item,
          ...data,
        });

        notify({ message: t('Menu item updated successfully'), type: 'success' });
      }

      await get();
    } catch (error) {
      console.error('Error saving menu item:', error);
      notify({ message: t('Failed to save menu item'), type: 'error' });
    }
  };

  // Add a child to a menu item
  const addChild = (parentId) => {
    setNewItemParentId(parentId);
    open();
  };

  const editItem = (item) => {
    setEditingItem(item);
    openEdit();
  };

  const closeEditModal = () => {
    setEditingItem(null);
    closeEdit();
  };

  return (
    <>
      <Helmet>
        <title>Menu Management</title>
      </Helmet>
      <main className="max-w-screen-lg mx-auto pt-4 flex flex-col px-[12px] sm:px-[24px]">
        <div className="flex w-full justify-between gap-2 my-3">
          <div>
            <H1 className="text-[32px] font-bold my-0!">{t('Menu Management')}</H1>
            {/* <p className="text-gray-500 mt-1 mb-3 text-sm">
              {t(
                'Use "/my-page" for internal links, and "https://example.com" for external links, or leave blank for navigation items without a link.'
              )}
            </p> */}
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
            <Button
              onClick={() => {
                setNewItemParentId(null);
                open();
              }}
            >
              <IconPlus size={16} className="sm:mr-1" />
              <span className={`hidden sm:inline`}>{t('Add Menu Item')}</span>
            </Button>
          </VisibilityControl>
        </div>

        <div className="relative flex-grow overflow-auto">
          <LoadingOverlay visible={loading} />

          {error && <div className="p-4 bg-red-100 text-red-700 rounded-md mb-4">{error}</div>}

          <div className="pt-4">
            {menuItems.length > 0 ? (
              menuItems.map((item) => (
                <MenuItem
                  key={item.id}
                  item={item}
                  moveItemUp={moveItemUp}
                  moveItemDown={moveItemDown}
                  changeParent={changeParent}
                  deleteItem={deleteItem}
                  addChild={addChild}
                  editItem={editItem}
                  allItems={data || []}
                  locales={locales || []}
                  pageContents={pageContents || []}
                />
              ))
            ) : (
              <div className="text-center py-8 text-gray-500">
                {loading ? t('Loading...') : t('No menu items yet. Add your first menu item!')}
              </div>
            )}
          </div>
        </div>

        {/* Add Menu Item Modal */}
        <EditMenuItemModal
          opened={opened}
          onClose={close}
          editingItem={null} // null for add mode
          onSave={handleModalSave}
          parentId={newItemParentId}
        />

        {/* Edit Menu Item Modal */}
        <EditMenuItemModal
          opened={editOpened}
          onClose={closeEditModal}
          editingItem={editingItem}
          onSave={handleModalSave}
        />
      </main>
    </>
  );
}
