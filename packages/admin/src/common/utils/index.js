export {
  getAttachmentUrl,
  getAttachmentRelativeUrl,
  getAttachmentByNameRelativeUrl,
  getFileNameFromAttachUrl,
  downloadFromAttachUrl,
  getFileExtension,
  formatFileSize,
  stringAvatar,
  stringToColor,
} from '@deepsel/cms-utils/common/utils';

export function renameKeys(keysMap, obj) {
  return Object.keys(obj).reduce(
    (acc, key) => ({
      ...acc,
      ...{ [keysMap[key] || key]: obj[key] },
    }),
    {},
  );
}

export function removeKeys(keysArray, obj) {
  const resObj = { ...obj };
  keysArray.forEach((k) => {
    if (k in resObj) {
      delete resObj[k];
    }
  });
  return resObj;
}

export function randomID(length = 9) {
  let result = '';
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const charactersLength = characters.length;
  let counter = 0;
  while (counter < length) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
    counter += 1;
  }
  return result;
}

/**
 * merge multiple classname
 *
 * @param classes
 * @returns {string}
 */
export const classNames = (...classes) => {
  return (classes || []).join(' ');
};

export function getActivityUserName(user, external_user_data = null) {
  if (external_user_data?.name) {
    return external_user_data.name;
  }
  return user.name || user.email || user.username;
}

export function capitalizeFirstLetter(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export const generateSlugFromStr = (str) => {
  if (!str && str !== 0) return '/';
  let s = String(str).trimStart();
  if (s.length === 0) return '/';
  s = s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  s = s.replace(/[^A-Za-z0-9]+/g, '-');
  s = s.replace(/^-+/, '');
  s = s.replace(/-{2,}/g, '-');
  s = s.toLowerCase();

  return s.length ? `/${s}` : '/';
};

/**
 * Merge server record contents with processed contents by id or locale_id, preserving server-side fields
 * like 'revisions' while using client's updated content fields.
 * Always returns exactly the items from processedContents (user's final choice).
 *
 * @param {Array} serverContents - Contents from server record (with revisions, etc.)
 * @param {Array} processedContents - Processed contents from client state (user's final choice)
 * @returns {Array} Merged contents preserving server data and using client updates
 */
export const mergeContentsWithServerData = (serverContents = [], processedContents = []) => {
  if (!serverContents.length) {
    return processedContents;
  }

  if (!processedContents.length) {
    return processedContents; // Return empty array if user chose to have no contents
  }

  // Create maps of server contents by both id and locale_id for fast lookup
  const serverContentsByIdMap = serverContents.reduce((map, serverContent) => {
    if (serverContent.id) {
      map[serverContent.id] = serverContent;
    }
    return map;
  }, {});

  const serverContentsByLocaleIdMap = serverContents.reduce((map, serverContent) => {
    if (serverContent.locale_id) {
      map[serverContent.locale_id] = serverContent;
    }
    return map;
  }, {});

  // Return all processed contents, merge with server data when id or locale_id matches
  return processedContents.map((processedContent) => {
    let serverContent = null;
    let matchedByLocaleId = false;

    // First try to match by id (existing content)
    if (processedContent.id && serverContentsByIdMap[processedContent.id]) {
      serverContent = serverContentsByIdMap[processedContent.id];
    }
    // If no id match, try to match by locale_id (handles new content with same language)
    else if (
      processedContent.locale_id &&
      serverContentsByLocaleIdMap[processedContent.locale_id]
    ) {
      serverContent = serverContentsByLocaleIdMap[processedContent.locale_id];
      matchedByLocaleId = true;
    }

    if (serverContent) {
      // Merge server content with processed content
      // Server fields like 'revisions', 'created_at', etc. take precedence
      // Client fields like 'title', 'content', 'slug', etc. from processed content take precedence
      const mergedContent = {
        ...serverContent, // Start with server data (includes revisions, timestamps, etc.)
        ...processedContent, // Override with client changes
        // Explicitly preserve server-only fields that shouldn't be overwritten
        revisions: serverContent.revisions,
      };

      // If matched by locale_id, ensure we use the server's id to update existing record
      if (matchedByLocaleId) {
        mergedContent.id = serverContent.id;
      }

      return mergedContent;
    }

    // If no matching server content found, return processed content as-is
    // This handles new content items created on client
    return processedContent;
  });
};
