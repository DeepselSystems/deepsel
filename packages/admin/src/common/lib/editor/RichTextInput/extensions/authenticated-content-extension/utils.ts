/**
 * Default content for authenticated content
 */
export const AUTHENTICATED_CONTENT_DEFAULT_CONTENT = `{% if user %} This is your authenticated content. Only logged in users will be able to see this. {% endif %}`;

/**
 * Constants for authenticated content attributes
 * BE CAREFUL TO EDIT THIS - IT AFFECTS OLDER DATA
 */
export const AUTHENTICATED_CONTENT_ATTRIBUTES = {
  CONTAINER: 'data-authenticated-content',
} as const;

/**
 * Constants for authenticated content CSS classes
 * BE CAREFUL TO EDIT THIS - IT AFFECTS OLDER DATA
 */
export const AUTHENTICATED_CONTENT_CLASSES = {
  WRAPPER: 'authenticated-content-wrapper',
  CONTENT: 'authenticated-content',
} as const;

/**
 * Check if content contains authenticated content regions
 * @param {HTMLElement} container - Container element to check
 * @returns {boolean} True if authenticated content regions are found
 */
export const containsAuthenticatedContent = (container: HTMLElement | null): boolean => {
  if (!container) return false;

  return (
    container.querySelector(`[${AUTHENTICATED_CONTENT_ATTRIBUTES.CONTAINER}]`) !== null ||
    container.querySelector(`.${AUTHENTICATED_CONTENT_CLASSES.WRAPPER}`) !== null
  );
};

/**
 * Initialize authenticated content functionality for a container
 * @param {HTMLElement} container - Container element with authenticated content
 */
export const initializeAuthenticatedContent = (container: HTMLElement | null): void => {
  if (!container) return;

  const authenticatedContentWrappers = [
    ...Array.from(container.querySelectorAll(`[${AUTHENTICATED_CONTENT_ATTRIBUTES.CONTAINER}]`)),
    ...Array.from(container.querySelectorAll(`.${AUTHENTICATED_CONTENT_CLASSES.WRAPPER}`)),
  ];

  authenticatedContentWrappers.forEach((wrapper) => {
    const contentDiv = wrapper.querySelector(`.${AUTHENTICATED_CONTENT_CLASSES.CONTENT}`);
    if (contentDiv && contentDiv instanceof HTMLElement) {
      contentDiv.style.padding = '1rem';
      contentDiv.style.backgroundColor = '#f9fafb';
      contentDiv.style.border = '1px solid #e5e7eb';
      contentDiv.style.borderRadius = '0.375rem';
    }
  });
};
