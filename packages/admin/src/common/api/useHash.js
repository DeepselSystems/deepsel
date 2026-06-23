import { useMemo } from 'react';

export default function useHash() {
  const hashParams = useMemo(() => {
    return new URLSearchParams(window.location.hash.replace('#', ''));
  }, [window.location.hash]);

  function updateHash(keyValueObject) {
    for (const key in keyValueObject) {
      if (keyValueObject.hasOwnProperty(key)) {
        hashParams.set(key, keyValueObject[key]);
      }
    }

    window.location.hash = hashParams.toString();
  }

  return {
    hashParams,
    updateHash,
  };
}
