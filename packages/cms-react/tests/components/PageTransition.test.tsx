import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { PageTransition } from '../../src/components/PageTransition';
import { WebsiteDataProvider } from '../../src/contexts/WebsiteDataContext';
import type { PageData } from '@deepsel/cms-utils';
import React from 'react';

describe('PageTransition (deprecated)', () => {
  const mockPageData: PageData = {
    id: '1',
    title: 'Test Page',
    slug: '/test',
    lang: 'en',
    seo_metadata: {
      title: 'Test SEO Title',
      description: 'Test description',
      allow_indexing: true,
    },
    public_settings: {
      default_language: {
        id: '1',
        name: 'English',
        iso_code: 'en',
      },
      available_languages: [{ id: '1', name: 'English', iso_code: 'en', code: 'en' }],
    },
  } as any;

  it('should render nothing (null)', () => {
    const { container } = render(
      <WebsiteDataProvider websiteData={{ type: 'Page', data: mockPageData }}>
        <PageTransition />
      </WebsiteDataProvider>,
    );

    expect(container.firstChild).toBeNull();
  });
});
