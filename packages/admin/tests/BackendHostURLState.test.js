import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('BackendHostURLState', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('uses the env default when localStorage is empty', async () => {
    const { default: envBackendHost } = await import('../src/constants/backendHost.js');
    const { default: store } = await import('../src/common/stores/BackendHostURLState.js');
    expect(store.getState().backendHost).toBe(envBackendHost);
  });

  it('reads the initial value from localStorage when present', async () => {
    localStorage.setItem('backendHost', 'https://from-storage/api/v1');
    const { default: store } = await import('../src/common/stores/BackendHostURLState.js');
    expect(store.getState().backendHost).toBe('https://from-storage/api/v1');
  });

  it('setBackendHost updates state and persists to localStorage', async () => {
    const { default: store } = await import('../src/common/stores/BackendHostURLState.js');
    store.getState().setBackendHost('https://new-host/api/v1');
    expect(store.getState().backendHost).toBe('https://new-host/api/v1');
    expect(localStorage.getItem('backendHost')).toBe('https://new-host/api/v1');
  });

  it('resetDefault restores the env default without writing localStorage', async () => {
    const { default: envBackendHost } = await import('../src/constants/backendHost.js');
    const { default: store } = await import('../src/common/stores/BackendHostURLState.js');
    store.getState().setBackendHost('https://temp/api/v1');
    expect(store.getState().backendHost).toBe('https://temp/api/v1');

    store.getState().resetDefault();
    expect(store.getState().backendHost).toBe(envBackendHost);
    // resetDefault is in-memory only — localStorage still holds the last set value.
    expect(localStorage.getItem('backendHost')).toBe('https://temp/api/v1');
  });
});
