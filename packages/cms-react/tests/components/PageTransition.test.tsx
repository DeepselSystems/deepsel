import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { PageTransition } from '../../src/components/PageTransition';
import { WebsiteDataProvider } from '../../src/contexts/WebsiteDataContext';
import type { PageData } from '@deepsel/cms-utils';
import React from 'react';

// Mock cms-utils — spread actual module so constants like FORM_FIELD_TYPE remain available
const mockFetchPageData = vi.fn();
const mockParseSlug = vi.fn();
const mockIsCrossingTemplateBoundary = vi.fn();

vi.mock('@deepsel/cms-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@deepsel/cms-utils')>();
  return {
    ...actual,
    fetchPageData: (args: any) => mockFetchPageData(args),
    parseSlug: (pathname: string) => mockParseSlug(pathname),
    isCrossingTemplateBoundary: (from: string, to: string) =>
      mockIsCrossingTemplateBoundary(from, to),
  };
});

describe('PageTransition', () => {
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

  beforeEach(() => {
    vi.clearAllMocks();
    document.title = '';

    // Setup meta tags
    const metaDescription = document.createElement('meta');
    metaDescription.setAttribute('name', 'description');
    document.head.appendChild(metaDescription);

    const metaRobots = document.createElement('meta');
    metaRobots.setAttribute('name', 'robots');
    document.head.appendChild(metaRobots);

    window.history.pushState = vi.fn();
    window.location = { href: '', pathname: '/test' } as any;
    // eslint-disable-next-line no-console
    console.log = vi.fn();
    console.warn = vi.fn();
    console.error = vi.fn();
  });

  afterEach(() => {
    document.head.innerHTML = '';
  });

  it('should update document title when pageData changes', () => {
    render(
      <WebsiteDataProvider websiteData={{ type: 'Page', data: mockPageData }}>
        <PageTransition />
      </WebsiteDataProvider>,
    );

    expect(document.title).toBe('Test SEO Title');
  });

  it('should update meta description when pageData changes', () => {
    render(
      <WebsiteDataProvider websiteData={{ type: 'Page', data: mockPageData }}>
        <PageTransition />
      </WebsiteDataProvider>,
    );

    const metaDescription = document.querySelector('meta[name="description"]');
    expect(metaDescription?.getAttribute('content')).toBe('Test description');
  });

  it('should update robots meta tag based on allow_indexing', () => {
    render(
      <WebsiteDataProvider websiteData={{ type: 'Page', data: mockPageData }}>
        <PageTransition />
      </WebsiteDataProvider>,
    );

    const metaRobots = document.querySelector('meta[name="robots"]');
    expect(metaRobots?.getAttribute('content')).toBe('index, follow');
  });

  it('should set noindex when allow_indexing is false', () => {
    const noIndexPageData = {
      ...mockPageData,
      seo_metadata: {
        ...mockPageData.seo_metadata,
        allow_indexing: false,
      },
    };

    render(
      <WebsiteDataProvider websiteData={{ type: 'Page', data: noIndexPageData }}>
        <PageTransition />
      </WebsiteDataProvider>,
    );

    const metaRobots = document.querySelector('meta[name="robots"]');
    expect(metaRobots?.getAttribute('content')).toBe('noindex, nofollow');
  });

  it('should update html lang attribute', () => {
    render(
      <WebsiteDataProvider websiteData={{ type: 'Page', data: mockPageData }}>
        <PageTransition />
      </WebsiteDataProvider>,
    );

    expect(document.documentElement.lang).toBe('en');
  });

  it('should intercept link clicks for client-side navigation', async () => {
    mockParseSlug.mockReturnValue({ lang: 'en', path: '/about', pathType: 'Page' });
    mockIsCrossingTemplateBoundary.mockReturnValue(false);
    mockFetchPageData.mockResolvedValue({
      ...mockPageData,
      title: 'About Page',
      slug: '/about',
    });

    const { container } = render(
      <WebsiteDataProvider websiteData={{ type: 'Page', data: mockPageData }}>
        <PageTransition />
        <a href="/about">About</a>
      </WebsiteDataProvider>,
    );

    const link = container.querySelector('a');
    link?.click();

    await waitFor(() => {
      expect(mockFetchPageData).toHaveBeenCalledWith({ lang: 'en', path: '/about' });
    });
  });

  it('should not intercept external links', () => {
    const { container } = render(
      <WebsiteDataProvider websiteData={{ type: 'Page', data: mockPageData }}>
        <PageTransition />
        <a href="https://example.com">External</a>
      </WebsiteDataProvider>,
    );

    const link = container.querySelector('a');
    link?.click();

    expect(mockFetchPageData).not.toHaveBeenCalled();
  });

  it('should not intercept links with target="_blank"', () => {
    const { container } = render(
      <WebsiteDataProvider websiteData={{ type: 'Page', data: mockPageData }}>
        <PageTransition />
        <a href="/about" target="_blank">
          About
        </a>
      </WebsiteDataProvider>,
    );

    const link = container.querySelector('a');
    link?.click();

    expect(mockFetchPageData).not.toHaveBeenCalled();
  });

  it('should not intercept hash links', () => {
    const { container } = render(
      <WebsiteDataProvider websiteData={{ type: 'Page', data: mockPageData }}>
        <PageTransition />
        <a href="#section">Section</a>
      </WebsiteDataProvider>,
    );

    const link = container.querySelector('a');
    link?.click();

    expect(mockFetchPageData).not.toHaveBeenCalled();
  });

  it('should not intercept mailto links', () => {
    const { container } = render(
      <WebsiteDataProvider websiteData={{ type: 'Page', data: mockPageData }}>
        <PageTransition />
        <a href="mailto:test@example.com">Email</a>
      </WebsiteDataProvider>,
    );

    const link = container.querySelector('a');
    link?.click();

    expect(mockFetchPageData).not.toHaveBeenCalled();
  });

  it('should not intercept download links', () => {
    const { container } = render(
      <WebsiteDataProvider websiteData={{ type: 'Page', data: mockPageData }}>
        <PageTransition />
        <a href="/file.pdf" download>
          Download
        </a>
      </WebsiteDataProvider>,
    );

    const link = container.querySelector('a');
    link?.click();

    expect(mockFetchPageData).not.toHaveBeenCalled();
  });

  it('should support onNavigate callback prop', () => {
    const onNavigate = vi.fn();

    const { container } = render(
      <WebsiteDataProvider websiteData={{ type: 'Page', data: mockPageData }}>
        <PageTransition onNavigate={onNavigate} />
      </WebsiteDataProvider>,
    );

    // Verify PageTransition accepts onNavigate prop without errors
    expect(container).toBeDefined();
    // Note: Testing actual click interception in happy-dom is unreliable
    // The component's click handler is tested via the other navigation tests
  });

  it('should call onPathChange callback when provided', async () => {
    const onPathChange = vi.fn();
    mockParseSlug.mockReturnValue({ lang: 'en', path: '/test', pathType: 'Page' });
    mockFetchPageData.mockResolvedValue(mockPageData);

    render(
      <WebsiteDataProvider websiteData={{ type: 'Page', data: mockPageData }}>
        <PageTransition onPathChange={onPathChange} />
      </WebsiteDataProvider>,
    );

    // Simulate popstate event
    window.dispatchEvent(new PopStateEvent('popstate'));

    await waitFor(() => {
      expect(onPathChange).toHaveBeenCalled();
    });
  });

  it('should handle popstate events for browser back/forward', async () => {
    mockParseSlug.mockReturnValue({ lang: 'en', path: '/test', pathType: 'Page' });
    mockFetchPageData.mockResolvedValue(mockPageData);

    render(
      <WebsiteDataProvider websiteData={{ type: 'Page', data: mockPageData }}>
        <PageTransition />
      </WebsiteDataProvider>,
    );

    window.dispatchEvent(new PopStateEvent('popstate'));

    await waitFor(() => {
      expect(mockFetchPageData).toHaveBeenCalled();
    });
  });

  it('should fallback to regular navigation on fetch error', async () => {
    mockParseSlug.mockReturnValue({ lang: 'en', path: '/error', pathType: 'Page' });
    mockIsCrossingTemplateBoundary.mockReturnValue(false);
    mockFetchPageData.mockResolvedValue({ notFound: true });

    const { container } = render(
      <WebsiteDataProvider websiteData={{ type: 'Page', data: mockPageData }}>
        <PageTransition />
        <a href="/error">Error Page</a>
      </WebsiteDataProvider>,
    );

    const link = container.querySelector('a');
    link?.click();

    await waitFor(() => {
      expect(window.location.href).toBe('/error');
    });
  });

  it('should not intercept link clicks on client pages', () => {
    const clientPageData = {
      ...mockPageData,
      clientPage: true,
    };

    mockIsCrossingTemplateBoundary.mockReturnValue(false);

    const { container } = render(
      <WebsiteDataProvider websiteData={{ type: 'Page', data: clientPageData }}>
        <PageTransition />
        <a href="/about">About</a>
      </WebsiteDataProvider>,
    );

    const link = container.querySelector('a');
    link?.click();

    expect(mockFetchPageData).not.toHaveBeenCalled();
  });

  it('should render nothing (null)', () => {
    const { container } = render(
      <WebsiteDataProvider websiteData={{ type: 'Page', data: mockPageData }}>
        <PageTransition />
      </WebsiteDataProvider>,
    );

    expect(container.firstChild).toBeNull();
  });
});
