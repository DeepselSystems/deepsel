/**
 * Domain utilities for multi-site functionality
 */

/**
 * Get port string for URL building
 * @param {string} domain - Domain to build URL for
 * @returns {string} Port string (e.g., ":3000" or "")
 */
function getPortForDomain(domain) {
  // If domain already includes a port, don't add another
  if (domain && domain.includes(':')) {
    return '';
  }

  if (!window.location.port) {
    return '';
  }

  return `:${window.location.port}`;
}

/**
 * Get the correct domain for an organization
 * @param {Object} organization - Organization object with domains array
 * @param {string} fallbackDomain - Fallback domain (current domain)
 * @returns {string} Domain to use for the organization
 */
export function getOrganizationDomain(organization, fallbackDomain = null) {
  if (!organization?.domains || !Array.isArray(organization.domains)) {
    return fallbackDomain || window.location.hostname;
  }

  // Find the first non-wildcard domain
  const specificDomain = organization.domains.find((domain) => domain !== '*');

  if (specificDomain) {
    return specificDomain;
  }

  // If only wildcard domains, use current domain as default
  return fallbackDomain || window.location.hostname;
}

/**
 * Get organization by ID from OrganizationState
 * @param {Array} organizations - Array of organizations from state
 * @param {number} organizationId - Organization ID to find
 * @returns {Object|null} Organization object or null if not found
 */
export function findOrganizationById(organizations, organizationId) {
  return organizations.find((org) => org.id === organizationId) || null;
}

/**
 * Build full URL with correct domain for a page/post
 * @param {Object} record - Page or blog post record with organization_id
 * @param {string} path - Path to append (e.g., '/en/about', '/blog/post-slug')
 * @param {Array} organizations - Organizations from state
 * @param {string} fallbackDomain - Fallback domain if organization not found
 * @returns {string} Full URL with correct domain
 */
export function buildFullUrl(record, path, organizations, fallbackDomain = null) {
  if (!record?.organization_id) {
    // No organization info, use current domain as fallback
    const currentDomain = fallbackDomain || window.location.hostname;
    const protocol = window.location.protocol;
    const port = getPortForDomain(currentDomain);

    return `${protocol}//${currentDomain}${port}${path}`;
  }

  // Find organization and get its domain
  const organization = findOrganizationById(organizations, record.organization_id);
  const domain = getOrganizationDomain(organization, fallbackDomain);

  // Determine protocol and port
  const protocol = window.location.protocol;
  const port = getPortForDomain(domain);

  return `${protocol}//${domain}${port}${path}`;
}

/**
 * Build page URL with correct domain
 * @param {Object} pageRecord - Page record with organization_id
 * @param {string} slug - Page slug
 * @param {string} localeIsoCode - Language code
 * @param {string} defaultLanguage - Default language of the site
 * @param {Array} organizations - Organizations from state
 * @returns {string} Full page URL with correct domain
 */
export function buildPageUrlWithDomain(
  pageRecord,
  slug,
  localeIsoCode,
  defaultLanguage,
  organizations,
) {
  if (!slug || !localeIsoCode) return '/';

  // Build the path
  const isDefaultLanguage =
    localeIsoCode.toLowerCase() === defaultLanguage?.iso_code?.toLowerCase();
  let path;

  if (isDefaultLanguage) {
    path = slug;
  } else {
    const localePrefix = `/${localeIsoCode}`;
    const cleanSlug = slug.startsWith('/') ? slug : `/${slug}`;
    path = `${localePrefix}${cleanSlug}`;
  }

  // Build full URL with correct domain
  return buildFullUrl(pageRecord, path, organizations);
}

/**
 * Build blog post URL with correct domain
 * @param {Object} blogPostRecord - Blog post record with organization_id
 * @param {string} slug - Post slug
 * @param {Array} organizations - Organizations from state
 * @returns {string} Full blog post URL with correct domain
 */
export function buildBlogPostUrlWithDomain(blogPostRecord, slug, organizations) {
  if (!slug) return '/';

  const path = `/blog${slug}`;
  return buildFullUrl(blogPostRecord, path, organizations);
}

/**
 * Build page path (without domain) for display purposes
 * @param {string} slug - Page slug
 * @param {string} localeIsoCode - Language code
 * @param {string} defaultLanguage - Default language of the site
 * @returns {string} Page path without domain
 */
export function buildPagePath(slug, localeIsoCode, defaultLanguage) {
  if (!slug || !localeIsoCode) return '/';

  // Build the path
  const isDefaultLanguage =
    localeIsoCode.toLowerCase() === defaultLanguage?.iso_code?.toLowerCase();

  if (isDefaultLanguage) {
    return slug;
  } else {
    const localePrefix = `/${localeIsoCode}`;
    const cleanSlug = slug.startsWith('/') ? slug : `/${slug}`;
    return `${localePrefix}${cleanSlug}`;
  }
}
