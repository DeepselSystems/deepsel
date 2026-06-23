import { Outlet } from 'react-router-dom';
import useAuthentication from '../api/useAuthentication.js';
import { useEffect, useMemo, memo } from 'react';
import { Preferences } from '@capacitor/preferences';

function PublicAuth() {
  const { user, fetchUser, setUser } = useAuthentication();

  const initUserData = useMemo(
    () => async () => {
      if (!user) {
        try {
          await fetchUser();
        } catch {
          await Preferences.remove({ key: 'userData' });
          setUser(null);
        }
      }
    },
    [user, fetchUser, setUser],
  );

  useEffect(() => {
    initUserData();
  }, []);

  return <Outlet />;
}

export default memo(PublicAuth);
