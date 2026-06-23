export default function linkIsCurrentPage(path, currentLanguage, defaultLanguage, windowHref) {
  let result;
  try {
    if (!path) result = false;
    // Handle relative URLs by resolving them against the current page URL
    const urlObject = new URL(path, windowHref);
    const currentUrl = new URL(windowHref);

    const pathToCompare = urlObject.pathname;
    let currentPath = currentUrl.pathname;

    if (currentLanguage === defaultLanguage && currentPath.startsWith(`/${defaultLanguage}/`)) {
      // remove language prefix for comparison
      currentPath = currentPath.replace(`/${defaultLanguage}`, ``);
    }

    result = pathToCompare === currentPath;
  } catch (e) {
    console.error('Error comparing URLs:', e);
    return false;
  }

  return result;
}
