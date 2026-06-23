import React from 'react';
import { useWebsiteData } from '../contexts/WebsiteDataContext.js';

export function ContentRenderer() {
  const { websiteData } = useWebsiteData();

  if (!websiteData?.data || !('content' in websiteData.data) || !websiteData.data.content) {
    return null;
  }

  const mainContent = typeof websiteData.data.content === 'string' ? websiteData.data.content : '';

  return (
    <article
      className="flex-1 pt-10 px-4 xl:px-2 min-w-0"
      dangerouslySetInnerHTML={{ __html: mainContent }}
    />
  );
}
