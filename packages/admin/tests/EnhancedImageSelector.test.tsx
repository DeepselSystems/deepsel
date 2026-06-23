import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

const useModelMock = vi.fn();
const useEffectOnceMock = vi.fn();

vi.mock('../src/common/lib/hooks', () => ({
  useModel: (...args: unknown[]) => useModelMock(...args),
  useEffectOnce: (cb: () => void) => useEffectOnceMock(cb),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { changeLanguage: vi.fn() },
  }),
}));

// Stub the heavy sub-components — they have their own hook dependencies
// and we only care about how EnhancedImageSelector wires data into them.
type StubProps = Record<string, unknown>;
const internalImagesProps: StubProps[] = [];
const stockImagesProps: StubProps[] = [];

vi.mock('../src/common/lib/ui/EnhancedImageSelector/components/InternalImages', () => ({
  InternalImages: (props: StubProps) => {
    internalImagesProps.push(props);
    return <div data-testid="internal-images" />;
  },
}));

vi.mock('../src/common/lib/ui/EnhancedImageSelector/components/SearchStockImages', () => ({
  SearchStockImages: (props: StubProps) => {
    stockImagesProps.push(props);
    return <div data-testid="stock-images" />;
  },
}));

import { EnhancedImageSelector } from '../src/common/lib/ui/EnhancedImageSelector';

const renderSelector = (overrides: Record<string, unknown> = {}) =>
  render(
    <MantineProvider>
      <EnhancedImageSelector
        backendHost="https://h/api/v1"
        user={{ id: 1, token: 'tok' } as never}
        setUser={vi.fn()}
        {...overrides}
      />
    </MantineProvider>,
  );

describe('EnhancedImageSelector', () => {
  beforeEach(() => {
    useModelMock.mockReset();
    useEffectOnceMock.mockReset();
    internalImagesProps.length = 0;
    stockImagesProps.length = 0;
    useModelMock.mockReturnValue({
      get: vi.fn().mockResolvedValue({ data: [{ id: 1, name: 'a.png' }], total: 1 }),
    });
  });

  it('loads attachments through useModel with an image-only filter and pageSize: null', () => {
    renderSelector();
    const [modelName, config, options] = useModelMock.mock.calls[0];
    expect(modelName).toBe('attachment');
    expect(config.backendHost).toBe('https://h/api/v1');
    expect(options.pageSize).toBeNull();
    expect(options.autoFetch).toBe(false);
    expect(options.filters).toEqual([
      { field: 'locale_versions.content_type', operator: 'like', value: 'image%' },
    ]);
  });

  it('renders the internal "Library" tab by default and forwards key props', () => {
    const onSelect = vi.fn();
    renderSelector({ onSelect, multiple: true, organizationId: 42 });

    // The internal tab is the default — it should render.
    expect(screen.queryByTestId('internal-images')).not.toBeNull();
    expect(internalImagesProps.length).toBe(1);
    const props = internalImagesProps[0];
    expect(props.multiple).toBe(true);
    expect(props.onSelect).toBe(onSelect);
    expect(props.backendHost).toBe('https://h/api/v1');
    expect(props.organizationId).toBe(42);
  });

  it('uses external selectedImages state when provided (controlled mode)', () => {
    const setSelectedImages = vi.fn();
    const selectedImages = [{ id: 5, name: 'x.png' } as never];
    renderSelector({ selectedImages, setSelectedImages });

    expect(internalImagesProps[0].selectedImages).toBe(selectedImages);
    expect(internalImagesProps[0].setSelectedImages).toBe(setSelectedImages);
  });

  it('kicks off the initial attachment fetch exactly once via useEffectOnce', () => {
    renderSelector();
    expect(useEffectOnceMock).toHaveBeenCalledTimes(1);
  });
});
