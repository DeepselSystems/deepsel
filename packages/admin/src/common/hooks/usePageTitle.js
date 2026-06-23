import { useEffect } from 'react';

export default function usePageTitle(title, dependencies = []) {
  useEffect(() => {
    const originalTitle = document.title;

    if (title) {
      setTitle(title);
      console.log('set title', title);
    } else {
      setTitle(originalTitle);
      console.log('set title org', originalTitle);
    }

    return () => {
      setTitle(originalTitle);
      console.log('set title org2', originalTitle);
    };
  }, [title, ...dependencies]);

  function setTitle(title) {
    document.title = title;
  }

  return { setTitle };
}
