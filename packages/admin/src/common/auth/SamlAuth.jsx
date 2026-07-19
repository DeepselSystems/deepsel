import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import useQuery from '../hooks/useQuery.jsx';
import useAuthentication from '../api/useAuthentication.js';
import { useBasename } from '../BasenameContext.js';

export default function SamlAuth() {
  const query = useQuery();
  const navigate = useNavigate();
  const basename = useBasename();
  const { fetchUser } = useAuthentication();

  const handleAuth = useCallback(async () => {
    const redirect = query.get('redirect');

    // Session cookie was set by the server on the SAML redirect.
    // Fetch the user data to populate the UI state.
    try {
      await fetchUser();
    } catch (error) {
      console.error('Failed to fetch user data after SAML auth:', error);
    }

    let targetPath = redirect ? decodeURIComponent(redirect) : '/pages';

    // Absolute URLs (public site page redirected here for require-login) need
    // a full page navigation — they live outside this SPA's `/admin` basename.
    if (/^https?:\/\//i.test(targetPath)) {
      window.location.href = targetPath;
      return;
    }

    // Navigate within the admin app
    if (targetPath.startsWith(basename)) {
      targetPath = targetPath.substring(basename.length) || '/pages';
    }
    navigate(targetPath);
  }, [query, navigate, basename, fetchUser]);

  useEffect(() => {
    handleAuth();
  }, [handleAuth]);

  return <></>;
}
