import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';

// Capture how the modal wires the underlying CMS hooks. We don't exercise
// the Mantine Dropzone interaction (covered by Playwright e2e) — we just
// verify the modal builds the right filters, passes through the upload
// config, and that its internal upload handler routes through useUpload.
const useModelMock = vi.fn();
const useUploadMock = vi.fn();
const useFetchMock = vi.fn();
const useEffectOnceMock = vi.fn();

vi.mock('../src/common/lib/hooks', () => ({
  useModel: (...args: unknown[]) => useModelMock(...args),
  useUpload: (...args: unknown[]) => useUploadMock(...args),
  useFetch: (...args: unknown[]) => useFetchMock(...args),
  useEffectOnce: (cb: () => void) => useEffectOnceMock(cb),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { changeLanguage: vi.fn() },
  }),
}));

import { ChooseAttachmentModal } from '../src/common/lib/ui/ChooseAttachmentModal';

const baseHookReturns = () => {
  useModelMock.mockReturnValue({
    data: [],
    setData: vi.fn(),
    get: vi.fn().mockResolvedValue(undefined),
    deleteWithConfirm: vi.fn(),
  });
  useUploadMock.mockReturnValue({
    uploadFileModel: vi.fn().mockResolvedValue([{ id: 99, name: 'new.png' }]),
    loading: false,
    error: null,
  });
  useFetchMock.mockReturnValue({
    get: vi.fn(),
  });
};

const renderModal = (overrides: Record<string, unknown> = {}) =>
  render(
    <MantineProvider>
      <ChooseAttachmentModal
        isOpen={true}
        close={vi.fn()}
        backendHost="https://h/api/v1"
        user={{ id: 1, token: 'tok-abc' } as never}
        setUser={vi.fn()}
        {...overrides}
      />
    </MantineProvider>,
  );

describe('ChooseAttachmentModal', () => {
  beforeEach(() => {
    useModelMock.mockReset();
    useUploadMock.mockReset();
    useFetchMock.mockReset();
    useEffectOnceMock.mockReset();
    baseHookReturns();
  });

  it("scopes the attachment list to the current user's owner_id", () => {
    renderModal();
    const [modelName, config, options] = useModelMock.mock.calls[0];
    expect(modelName).toBe('attachment');
    expect(config.backendHost).toBe('https://h/api/v1');
    expect(options.pageSize).toBeNull();
    expect(options.filters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'owner_id', operator: '=', value: 1 }),
      ]),
    );
  });

  it("adds a content_type like 'image%' filter when type='image'", () => {
    renderModal({ type: 'image' });
    const options = useModelMock.mock.calls[0][2];
    expect(options.filters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'locale_versions.content_type',
          operator: 'like',
          value: 'image%',
        }),
      ]),
    );
  });

  it('passes initialFilters through alongside the owner scope', () => {
    renderModal({ filters: [{ field: 'used_for', operator: '=', value: 'AVATAR' }] });
    const options = useModelMock.mock.calls[0][2];
    expect(options.filters).toEqual([
      { field: 'used_for', operator: '=', value: 'AVATAR' },
      { field: 'owner_id', operator: '=', value: 1 },
    ]);
  });

  it('wires useUpload with the user token and the explicit organizationId prop', () => {
    renderModal({ organizationId: 42 });
    const [config] = useUploadMock.mock.calls[0];
    expect(config).toEqual({
      backendHost: 'https://h/api/v1',
      token: 'tok-abc',
      organizationId: 42,
    });
  });

  it('asks for the upload size limit on mount through the consuming app callback', () => {
    const onFetchUploadSizeLimit = vi.fn();
    renderModal({ onFetchUploadSizeLimit });
    // useEffectOnce ran the registered effect — call it ourselves to
    // verify our callback gets the fetcher function returned by useFetch.
    expect(useEffectOnceMock).toHaveBeenCalled();
    const effect = useEffectOnceMock.mock.calls[0][0];
    effect();
    expect(onFetchUploadSizeLimit).toHaveBeenCalled();
    expect(typeof onFetchUploadSizeLimit.mock.calls[0][0]).toBe('function');
  });

  it('configures useFetch for the upload-size-limit endpoint without auto-fetching', () => {
    renderModal();
    const [path, config, options] = useFetchMock.mock.calls[0];
    expect(path).toBe('attachment/config/upload_size_limit');
    expect(config.backendHost).toBe('https://h/api/v1');
    expect(options).toEqual({ autoFetch: false });
  });
});
