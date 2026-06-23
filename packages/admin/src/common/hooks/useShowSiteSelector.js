import { useEffect } from 'react';
import ShowSiteSelectorState from '../stores/ShowSiteSelectorState.js';

export default function useShowSiteSelector() {
  const setShowSiteSelector = ShowSiteSelectorState((state) => state.setShowSiteSelector);
  useEffect(() => {
    setShowSiteSelector(true);
    return () => setShowSiteSelector(false);
  }, [setShowSiteSelector]);
}
