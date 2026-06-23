import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import OrganizationIdState from '../../../common/stores/OrganizationIdState.js';
import useModel from '../../../common/api/useModel.jsx';
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

  // Helper function to reorder all siblings at a level
  const reorderSiblings = async (parentId) => {
    try {
      // Get all siblings at this level
      const siblings = data
        .filter((menuItem) =>
          parentId === null ? menuItem.parent_id === null : menuItem.parent_id === parentId,
        )
        .sort((a, b) => a.position - b.position);

      const updatePromises = siblings.map((item, index) => {
        return update({
          ...item,
          position: index,
        });
      });

      await Promise.all(updatePromises);

      // Refresh data
      await get();
    } catch (error) {
      console.error('Error reordering siblings:', error);
      throw error;
    }
  };

  // Move item up in the list
  const moveItemUp = async (itemId) => {
    try {
      const item = menuItemsMap[itemId];
      if (!item) return;

      // Find siblings (items with the same parent)
      const siblings = data
        .filter((menuItem) => menuItem.parent_id === item.parent_id)
        .sort((a, b) => a.position - b.position);

      // Find the current item's index among siblings
      const currentIndex = siblings.findIndex((sibling) => sibling.id === itemId);

      // If already at the top, do nothing
      if (currentIndex <= 0) return;

      // Create a new array with the item moved up
      const reorderedSiblings = [...siblings];
      const temp = reorderedSiblings[currentIndex];
      reorderedSiblings[currentIndex] = reorderedSiblings[currentIndex - 1];
      reorderedSiblings[currentIndex - 1] = temp;

      // Update all positions
      const updatePromises = reorderedSiblings.map((item, index) => {
        return update({
          ...item,
          position: index,
        });
      });

      await Promise.all(updatePromises);

      // Refresh data
      await get();
    } catch (error) {
      console.error('Error moving item up:', error);
      notify({ message: t('Failed to move menu item'), type: 'error' });
    }
  };

  // Move item down in the list
  const moveItemDown = async (itemId) => {
    try {
      const item = menuItemsMap[itemId];
      if (!item) return;

      // Find siblings (items with the same parent)
      const siblings = data
        .filter((menuItem) => menuItem.parent_id === item.parent_id)
        .sort((a, b) => a.position - b.position);

      // Find the current item's index among siblings
      const currentIndex = siblings.findIndex((sibling) => sibling.id === itemId);

      // If already at the bottom, do nothing
      if (currentIndex >= siblings.length - 1 || currentIndex === -1) return;

      // Create a new array with the item moved down
      const reorderedSiblings = [...siblings];
      const temp = reorderedSiblings[currentIndex];
      reorderedSiblings[currentIndex] = reorderedSiblings[currentIndex + 1];
      reorderedSiblings[currentIndex + 1] = temp;

      // Update all positions
      const updatePromises = reorderedSiblings.map((item, index) => {
        return update({
          ...item,
          position: index,
        });
      });

      await Promise.all(updatePromises);

      // Refresh data
      await get();
    } catch (error) {
      console.error('Error moving item down:', error);
      notify({ message: t('Failed to move menu item'), type: 'error' });
    }
  };

  // Change parent of an item
  const changeParent = async (itemId, newParentId) => {
    try {
      console.log(`Changing parent for item ${itemId} to ${newParentId}`);

      // Get the latest data first
      const latestData = await get();

      // Find the item directly in the data array
      const menuData = Array.isArray(latestData) ? latestData : latestData?.data || [];
      const item = menuData.find((item) => item.id === itemId);

      if (!item) {
        console.error(`Item with id ${itemId} not found in data array`);
        notify({ message: t('Menu item not found'), type: 'error' });
        return false;
      }

      console.log('Item before update:', item);
      const oldParentId = item.parent_id;

      // First, update the item with new parent
      const updatedItem = await update({
        ...item,
        parent_id: newParentId,
        // Temporarily set to a high position to ensure it's at the end
        position: 1000,
      });

      console.log('Item after update:', updatedItem);

      // Force a refresh to ensure the database has the updated parent_id
      await get();

      // Handle the new parent level first to ensure the item is properly placed
      console.log(`Reordering siblings at new parent level: ${newParentId}`);
      if (newParentId !== null) {
        // Get items with this parent
        const newParentItems = menuData.filter((item) => item.parent_id === newParentId);
        // Add our moved item
        newParentItems.push({ ...updatedItem, position: 1000 });
        // Sort and update positions
        newParentItems.sort((a, b) => a.position - b.position);

        // Update positions sequentially
        for (let i = 0; i < newParentItems.length; i++) {
          await update({
            ...newParentItems[i],
            position: i,
          });
        }
      } else {
        // Handle root items
        const rootItems = menuData.filter((item) => item.parent_id === null && item.id !== itemId);
        // Add our moved item
        rootItems.push({ ...updatedItem, parent_id: null, position: 1000 });
        // Sort and update positions
        rootItems.sort((a, b) => a.position - b.position);

        // Update positions sequentially
        for (let i = 0; i < rootItems.length; i++) {
          await update({
            ...rootItems[i],
            position: i,
          });
        }
      }

      // Now handle the old parent level if it's different
      if (oldParentId !== newParentId) {
        console.log(`Reordering siblings at old parent level: ${oldParentId}`);
        if (oldParentId !== null) {
          // Get items with the old parent, excluding the moved item
          const oldParentItems = menuData.filter(
            (item) => item.parent_id === oldParentId && item.id !== itemId,
          );

          // Sort and update positions
          oldParentItems.sort((a, b) => a.position - b.position);

          // Update positions sequentially
          for (let i = 0; i < oldParentItems.length; i++) {
            await update({
              ...oldParentItems[i],
              position: i,
            });
          }
        } else {
          // Handle root items, excluding the moved item
          const rootItems = menuData.filter(
            (item) => item.parent_id === null && item.id !== itemId,
          );

          // Sort and update positions
          rootItems.sort((a, b) => a.position - b.position);

          // Update positions sequentially
          for (let i = 0; i < rootItems.length; i++) {
            await update({
              ...rootItems[i],
              position: i,
            });
          }
        }
      }

      // Force a complete refresh of the data
      const freshData = await get();
      console.log('Fresh data after parent change:', freshData);

      // Get the actual array of items from the response
      const menuData2 = Array.isArray(freshData) ? freshData : freshData?.data || [];

      // Force rebuild the menu tree with fresh data
      const { rootItems, itemMap } = buildMenuTree(menuData2);
      console.log('New menu tree:', rootItems);
      setMenuItems(rootItems);
      setMenuItemsMap(itemMap);

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

  // Delete a menu item
  const deleteItem = async (id) => {
    try {
      const item = menuItemsMap[id];
      if (!item) return;

      const parentId = item.parent_id;

      // Use deleteWithConfirm to show a confirmation dialog before deleting
      deleteWithConfirm(
        [id],
        async () => {
          notify({
            message: t('Menu item deleted successfully'),
            type: 'success',
          });

          // Fetch the latest data after deletion
          const freshData = await get();

          // Now reorder siblings using the fresh data
          try {
            console.log(`Reordering siblings with parent_id: ${parentId} after deletion`);

            // Get all siblings at this level from the fresh data
            const menuData = Array.isArray(freshData) ? freshData : freshData?.data || [];
            const siblings = menuData
              .filter((menuItem) =>
                parentId === null ? menuItem.parent_id === null : menuItem.parent_id === parentId,
              )
              .sort((a, b) => a.position - b.position);

            console.log(
              `Found ${siblings.length} siblings to reorder after deletion:`,
              siblings.map((s) => ({ id: s.id, title: s.title })),
            );

            // Update each sibling with a new position
            for (let i = 0; i < siblings.length; i++) {
              await update({
                ...siblings[i],
                position: i,
              });
            }

            // Final refresh of data
            await get();
          } catch (reorderError) {
            console.error('Error reordering siblings after deletion:', reorderError);
            // Don't throw the error, as the deletion was successful
          }
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

        // Create the item with a temporary high position
        await create({
          ...data,
          organization_id: organizationId,
          position: 1000, // Temporary high position
          active: true,
        });

        // Then reorder all siblings at this level
        await reorderSiblings(data.parent_id);

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
            <H1 className="text-[32px] font-bold text-primary my-0!">{t('Menu Management')}</H1>
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
              className={`shadow bg-primary-main text-primary-contrastText`}
              color={`primary`}
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
