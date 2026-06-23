import { useLocation, useNavigate } from 'react-router-dom';
import { useRef, useEffect } from 'react';
import usePreviousLocation from './usePreviousLocation';

function getParentPath(pathname) {
  const pathSegments = pathname.split('/');
  pathSegments.pop();
  const newPath = pathSegments.join('/') || '/';
  return newPath;
}

export default function useBack() {
  const location = useLocation();
  const navigate = useNavigate();
  const prevLocation = usePreviousLocation();

  function back() {
    if (history.length > 1) {
      const prevPath = prevLocation.pathname;
      if (prevPath !== '/login') {
        navigate(-1);
        return;
      }
    }

    const currentPath = location.pathname;
    const newPath = getParentPath(currentPath);
    navigate(newPath);
  }

  return { back };
}
