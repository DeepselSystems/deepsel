import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Custom hook to navigate back with redirect param
 * @param {string} redirectParamKey
 */
const useBackWithRedirect = (redirectParamKey = 'redirect') => {
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback(() => {
    const params = new URLSearchParams(location.search);
    const redirectParam = params.get(redirectParamKey);

    if (redirectParam) {
      // Ensure redirect path always starts with "/"
      const redirectPath = redirectParam.startsWith('/') ? redirectParam : `/${redirectParam}`;

      // Absolute URL with current origin
      const redirectUrl = `${window.location.origin}${redirectPath}`;

      // Redirect to new URL, replace history entry
      window.location.replace(redirectUrl);
    } else {
      // Fallback: navigate back in history
      navigate(-1);
    }
  }, [location.search, navigate, redirectParamKey]);
};

export default useBackWithRedirect;
