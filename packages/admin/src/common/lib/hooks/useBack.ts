import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Provides a back() function that navigates to the previous history entry,
 * or to the parent path when there is no history to go back to.
 */
export function useBack() {
  const location = useLocation();
  const navigate = useNavigate();

  function back() {
    if (history.length > 1) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      navigate(-1);
    } else {
      const currentPath = location.pathname;
      const pathSegments = currentPath.split('/');
      pathSegments.pop();
      const newPath = pathSegments.join('/') || '/';

      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      navigate(newPath);
    }
  }

  return { back };
}
