/**
 * Builds a hierarchical menu tree from a flat list of menu items
 * @param {Array} items - Flat list of menu items
 * @returns {Object} - Object containing the tree structure and a map of all items
 */
export const buildMenuTree = (items) => {
  // Handle case when items is not an array or is in a different format
  const menuItems = Array.isArray(items) ? items : items?.data || [];

  const itemMap = {};
  const rootItems = [];

  // First pass: create a map of all items
  menuItems.forEach((item) => {
    itemMap[item.id] = { ...item, children: [] };
  });

  // Second pass: build the tree structure
  menuItems.forEach((item) => {
    if (item.parent_id && itemMap[item.parent_id]) {
      // This item has a parent, add it to the parent's children
      itemMap[item.parent_id].children.push(itemMap[item.id]);
    } else {
      // This is a root item
      rootItems.push(itemMap[item.id]);
    }
  });

  // Sort by position
  const sortByPosition = (a, b) => a.position - b.position;
  rootItems.sort(sortByPosition);

  // Sort children by position
  const sortChildrenRecursive = (items) => {
    if (!Array.isArray(items)) return;

    items.forEach((item) => {
      if (item.children && item.children.length > 0) {
        item.children.sort(sortByPosition);
        sortChildrenRecursive(item.children);
      }
    });
  };

  sortChildrenRecursive(rootItems);

  return { rootItems, itemMap };
};

/**
 * Checks if an item is a child of another item (to prevent circular references)
 * @param {Object} item - The item to check
 * @param {number} potentialParentId - The ID of the potential parent
 * @returns {boolean} - True if the item is a child of the potential parent
 */
export const isChildOf = (item, potentialParentId) => {
  if (!item.children) return false;
  return item.children.some(
    (child) => child.id === potentialParentId || isChildOf(child, potentialParentId),
  );
};

/**
 * Validates a URL to ensure it starts with "/" or "http"
 * @param {string} url - The URL to validate
 * @returns {boolean} - True if the URL is valid
 */
export const isValidUrl = (url) => {
  if (!url) return true; // Empty URLs are valid (optional)
  return url.startsWith('/') || url.toLowerCase().startsWith('http');
};

/**
 * Gets the language code from a locale ID
 * @param {number} localeId - The locale ID
 * @param {Array} locales - Array of available locales
 * @returns {string|null} - The language code or null if not found
 */
export const getLanguageCode = (localeId, locales) => {
  const locale = locales?.find((locale) => locale.id === parseInt(localeId));
  return locale ? locale.iso_code : null;
};

/**
 * Gets the language name from a locale code
 * @param {string} localeCode - The locale code
 * @param {Array} locales - Array of available locales
 * @returns {string} - The language name or the code if not found
 */
export const getLanguageName = (localeCode, locales) => {
  const locale = locales?.find((locale) => locale.iso_code === localeCode);
  return locale ? locale.name : localeCode;
};

/**
 * Gets the language flag emoji from a locale code
 * @param {string} localeCode - The locale code
 * @param {Array} locales - Array of available locales
 * @returns {string} - The language flag emoji or empty string if not found
 */
export const getLanguageFlag = (localeCode, locales) => {
  const locale = locales?.find((locale) => locale.iso_code === localeCode);
  return locale ? locale.emoji_flag : '';
};

/**
 * Gets the default language code
 * @param {number} defaultLanguageId - The default language ID
 * @param {Array} locales - Array of available locales
 * @returns {string|null} - The default language code or null if not found
 */
export const getDefaultLanguageCode = (defaultLanguageId, locales) => {
  const defaultLocale = locales?.find((locale) => locale.id === defaultLanguageId);
  return defaultLocale ? defaultLocale.iso_code : null;
};
