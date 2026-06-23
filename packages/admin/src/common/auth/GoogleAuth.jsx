import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useQuery from '../hooks/useQuery.jsx';
import useAuthentication from '../api/useAuthentication.js';
import { useBasename } from '../BasenameContext.js';

export default function GoogleAuth() {
  const query = useQuery();
  const navigate = useNavigate();
  const basename = useBasename();
  const { fetchUser } = useAuthentication();

  useEffect(() => {
    handleAuth();
  }, []);

  async function handleAuth() {
    const redirect = query.get('redirect');

    // Session cookie was set by the server on the OAuth redirect.
    // Fetch the user data to populate the UI state.
    try {
      await fetchUser();
    } catch (error) {
      console.error('Failed to fetch user data after Google auth:', error);
    }

    // Navigate within the admin app
    let targetPath = redirect ? decodeURIComponent(redirect) : '/pages';
    if (targetPath.startsWith(basename + '/')) {
      targetPath = targetPath.substring(basename.length) || '/pages';
    } else if (targetPath.startsWith(basename)) {
      targetPath = targetPath.substring(basename.length) || '/pages';
    }
    navigate(targetPath);
  }

  return <></>;
}
