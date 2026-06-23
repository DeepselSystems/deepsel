import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import useAuthentication from '../api/useAuthentication.js';
import { useEffect, useState, useMemo, memo } from 'react';
import trackingSettings from '../../constants/trackingSettings.js';
import SitePublicSettingsState from '../stores/SitePublicSettingsState.js';
import BackendHostURLState from '../stores/BackendHostURLState.js';
import UserState from '../stores/UserState.js';

function isAuthenticated(user) {
  return !!user;
}

function RequireAuth() {
  const location = useLocation();
  const { user: currentUser, fetchUser, login } = useAuthentication();
  const [initialized, setInitialized] = useState(false);
  const navigate = useNavigate();
  const { settings: siteSettings, setSettings } = SitePublicSettingsState();

  const checkAuth = useMemo(
    () => async () => {
      try {
        let isAuthlessMode = siteSettings?.authless;

        if (!siteSettings) {
          try {
            const { backendHost } = BackendHostURLState.getState();
            const response = await fetch(`${backendHost}/util/public_settings/1`, {
              credentials: 'include',
            });
            if (response.ok) {
              const settings = await response.json();
              setSettings(settings);
              isAuthlessMode = settings?.authless;
            }
          } catch (e) {
            console.error('Failed to fetch site public settings', e);
          }
        }

        if (isAuthlessMode) {
          if (!isAuthenticated(currentUser)) {
            try {
              await login({ identifier: 'authless', password: 'authless' });
            } catch (e) {
              console.error('Authless login failed', e);
            }
          }
          setInitialized(true);
          return;
        }

        if (!isAuthenticated(currentUser)) {
          const fullPath = location.pathname + location.search;
          const rejectLink = '/login?' + new URLSearchParams({ redirect: fullPath }).toString();

          try {
            await fetchUser();
          } catch (e) {
            return navigate(rejectLink);
          }

          const updatedUser = UserState.getState().user;
          if (!isAuthenticated(updatedUser)) {
            return navigate(rejectLink);
          }
        }

        if (currentUser && trackingSettings.enableXRAY && window.XRAY) {
          window.XRAY.setCurrentUser(currentUser);
        }
      } finally {
        setInitialized(true);
      }
    },
    [currentUser, fetchUser, location, navigate, siteSettings, login, setSettings],
  );

  useEffect(() => {
    checkAuth();
  }, []);

  // Redirect to login when user loses authentication (logout, session expiry)
  useEffect(() => {
    if (initialized && !isAuthenticated(currentUser)) {
      const fullPath = location.pathname + location.search;
      navigate('/login?' + new URLSearchParams({ redirect: fullPath }).toString());
    }
  }, [initialized, currentUser, location, navigate]);

  return initialized && isAuthenticated(currentUser) ? <Outlet /> : <div>Loading...</div>;
}

export default memo(RequireAuth);
