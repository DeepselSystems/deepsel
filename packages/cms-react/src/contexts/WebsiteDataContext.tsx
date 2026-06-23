import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { WebsiteData } from '@deepsel/cms-utils';
import { PageTransition } from '../components/index.js';

type WebsiteDataContextValue = {
  websiteData: WebsiteData;
  setWebsiteData: (websiteData: WebsiteData) => void;
};

const WebsiteDataContext = createContext<WebsiteDataContextValue | null>(null);

type WebsiteDataProviderProps = {
  websiteData: WebsiteData;
  children: ReactNode;
};

export function WebsiteDataProvider({ websiteData, children }: WebsiteDataProviderProps) {
  const [websiteDataState, setWebsiteDataState] = useState(websiteData);
  const [pathname, setPathname] = useState('');

  // Set pathname after mount to avoid SSR/hydration mismatch
  useEffect(() => {
    setPathname(window.location.pathname);

    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', onPopState);

    // Observe pushState/replaceState for client-side navigation
    const origPush = history.pushState.bind(history);
    const origReplace = history.replaceState.bind(history);
    history.pushState = (...args) => {
      origPush(...args);
      setPathname(window.location.pathname);
    };
    history.replaceState = (...args) => {
      origReplace(...args);
      setPathname(window.location.pathname);
    };

    return () => {
      window.removeEventListener('popstate', onPopState);
      history.pushState = origPush;
      history.replaceState = origReplace;
    };
  }, []);

  const value: WebsiteDataContextValue = {
    websiteData: {
      ...websiteDataState,
      settings: websiteDataState.data?.public_settings, // for ease of access
      pathname,
    },
    setWebsiteData: (newWebsiteData: WebsiteData) => {
      setWebsiteDataState({
        ...newWebsiteData,
        settings: newWebsiteData.data?.public_settings, // for ease of access
      });
    },
  };

  // Listen for preview data from admin iframe parent
  useEffect(() => {
    const inIframe = typeof window !== 'undefined' && window.parent !== window;
    if (!inIframe) return;

    // Signal to admin that the iframe is ready to receive preview data
    window.parent.postMessage({ type: 'IFRAME_READY' }, '*');

    const handleMessage = (event: MessageEvent) => {
      if (!event.data) return;
      const { type, data } = event.data;
      if ((type === 'PREVIEW_DATA' || type === 'TEMPLATE_PREVIEW_DATA') && data) {
        setWebsiteDataState((prev) => ({
          ...prev,
          data: { ...prev.data, ...data },
        }));
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <WebsiteDataContext.Provider value={value}>
      <PageTransition />
      {children}
    </WebsiteDataContext.Provider>
  );
}

export function useWebsiteData() {
  const ctx = useContext(WebsiteDataContext);
  if (!ctx) {
    throw new Error('useWebsiteData must be used inside <WebsiteDataProvider>');
  }

  return ctx;
}
