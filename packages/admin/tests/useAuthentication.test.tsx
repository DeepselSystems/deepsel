import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Capture Capacitor Preferences interactions so tests can assert what's
// persisted (and read predictable values back).
const preferencesStore = new Map<string, string>();
const preferencesSet = vi.fn(async ({ key, value }: { key: string; value: string }) => {
  preferencesStore.set(key, value);
});
const preferencesGet = vi.fn(async ({ key }: { key: string }) => ({
  value: preferencesStore.get(key) ?? null,
}));
const preferencesRemove = vi.fn(async ({ key }: { key: string }) => {
  preferencesStore.delete(key);
});

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    set: (args: { key: string; value: string }) => preferencesSet(args),
    get: (args: { key: string }) => preferencesGet(args),
    remove: (args: { key: string }) => preferencesRemove(args),
  },
}));

vi.mock('@capacitor/device', () => ({
  Device: {
    getInfo: vi.fn(async () => ({ platform: 'web', osVersion: '1.0' })),
  },
}));

vi.mock('@mantine/hooks', async () => {
  const actual = await vi.importActual<typeof import('@mantine/hooks')>('@mantine/hooks');
  return {
    ...actual,
    useNetwork: () => ({ online: true }),
  };
});

vi.mock('react-device-detect', () => ({
  useDeviceData: () => ({
    os: { name: 'macOS' },
    browser: { name: 'Chrome' },
    cpu: { architecture: 'amd64' },
  }),
}));

import { useAuthentication } from '../src/common/lib/hooks/useAuthentication';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter>{children}</MemoryRouter>
);

const baseConfig = (overrides: Record<string, unknown> = {}) => ({
  backendHost: 'https://h/api/v1',
  user: null,
  setUser: vi.fn(),
  organizationId: 1,
  ...overrides,
});

function jsonResponse(body: unknown, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe('useAuthentication', () => {
  beforeEach(() => {
    preferencesStore.clear();
    preferencesSet.mockClear();
    preferencesGet.mockClear();
    preferencesRemove.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('login', () => {
    it('persists user data and updates the store on success', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse({ user: { id: 7, email: 'tim@x' } }));
      vi.stubGlobal('fetch', fetchMock);

      const setUser = vi.fn();
      const { result } = renderHook(() => useAuthentication(baseConfig({ setUser })), {
        wrapper,
      });

      let returned: unknown;
      await act(async () => {
        returned = await result.current.login({ identifier: 'tim@x', password: 'pw' });
      });

      expect(returned).toEqual({ id: 7, email: 'tim@x' });
      expect(setUser).toHaveBeenCalledWith({ id: 7, email: 'tim@x' });
      expect(preferencesSet).toHaveBeenCalledWith({
        key: 'userData',
        value: JSON.stringify({ id: 7, email: 'tim@x' }),
      });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://h/api/v1/token');
      expect(init.method).toBe('POST');
      expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
      expect(init.credentials).toBe('include');
      expect(init.body).toContain('username=tim%40x');
      expect(init.body).toContain('password=pw');
      expect(init.body).toContain('organization_id=1');
    });

    it('returns the 2FA marker without persisting any user', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse({ is_require_user_config_2fa: true }));
      vi.stubGlobal('fetch', fetchMock);

      const setUser = vi.fn();
      const { result } = renderHook(() => useAuthentication(baseConfig({ setUser })), {
        wrapper,
      });

      let returned: unknown;
      await act(async () => {
        returned = await result.current.login({ identifier: 'tim@x', password: 'pw' });
      });

      expect(returned).toEqual({ is_require_user_config_2fa: true });
      expect(setUser).not.toHaveBeenCalled();
      expect(preferencesSet).not.toHaveBeenCalled();
    });

    it('on bad credentials, surfaces formatErrorDetail message and does not persist', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ detail: 'Incorrect username or password' }, { ok: false, status: 401 }),
        );
      vi.stubGlobal('fetch', fetchMock);

      const setUser = vi.fn();
      const { result } = renderHook(() => useAuthentication(baseConfig({ setUser })), {
        wrapper,
      });

      let caught: Error | undefined;
      await act(async () => {
        try {
          await result.current.login({ identifier: 'tim@x', password: 'wrong' });
        } catch (e) {
          caught = e as Error;
        }
      });
      expect(caught?.message).toBe('Incorrect username or password');

      expect(setUser).not.toHaveBeenCalled();
      expect(preferencesSet).not.toHaveBeenCalled();
      expect(result.current.error).toBe('Incorrect username or password');
    });

    it('retries with organization_id=1 when stale org returns 403', async () => {
      const setOrganizationId = vi.fn();
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(
            { detail: 'User is not a member of the requested organization' },
            { ok: false, status: 403 },
          ),
        )
        .mockResolvedValueOnce(jsonResponse({ user: { id: 1 } }));
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHook(
        () => useAuthentication(baseConfig({ organizationId: 42, setOrganizationId })),
        { wrapper },
      );

      await act(async () => {
        await result.current.login({ identifier: 'tim@x', password: 'pw' });
      });

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[0][1].body).toContain('organization_id=42');
      expect(fetchMock.mock.calls[1][1].body).toContain('organization_id=1');
      expect(setOrganizationId).toHaveBeenCalledWith(1);
    });
  });

  describe('signup', () => {
    it('POSTs JSON to /signup and auto-logs in by default', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({}))
        .mockResolvedValueOnce(jsonResponse({ user: { id: 5, email: 'x@y' } }));
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHook(() => useAuthentication(baseConfig()), { wrapper });
      await act(async () => {
        await result.current.signup({ email: 'x@y', password: 'pw' });
      });

      const [signupUrl, signupInit] = fetchMock.mock.calls[0];
      expect(signupUrl).toBe('https://h/api/v1/signup');
      expect(signupInit.method).toBe('POST');
      expect(signupInit.headers['Content-Type']).toBe('application/json');
      expect(JSON.parse(signupInit.body)).toEqual({
        email: 'x@y',
        password: 'pw',
        organization_id: 1,
      });
      // Second call is the auto-login token request.
      expect(fetchMock.mock.calls[1][0]).toBe('https://h/api/v1/token');
    });

    it('skips auto-login when autoLogin=false', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
      vi.stubGlobal('fetch', fetchMock);

      const { result } = renderHook(() => useAuthentication(baseConfig()), { wrapper });
      await act(async () => {
        await result.current.signup({ email: 'x@y', password: 'pw' }, false);
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toBe('https://h/api/v1/signup');
    });
  });

  describe('logout', () => {
    it('POSTs /logout/oidc, clears persisted userData, and nulls the user store', async () => {
      // Pre-seed persisted user so we can verify the remove actually targets the key.
      preferencesStore.set('userData', JSON.stringify({ id: 1 }));

      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
      vi.stubGlobal('fetch', fetchMock);

      // window.location.reload() throws by default in happy-dom; replace with a spy.
      const reloadSpy = vi.fn();
      const originalLocation = window.location;
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: { ...originalLocation, reload: reloadSpy },
      });

      const setUser = vi.fn();
      const { result } = renderHook(() => useAuthentication(baseConfig({ setUser })), {
        wrapper,
      });

      let caught: Error | undefined;
      await act(async () => {
        try {
          await result.current.logout();
        } catch (e) {
          caught = e as Error;
        }
      });
      expect(caught?.message).toBe('Unauthorized');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://h/api/v1/logout/oidc',
        expect.objectContaining({ method: 'POST', credentials: 'include' }),
      );
      expect(preferencesRemove).toHaveBeenCalledWith({ key: 'userData' });
      expect(setUser).toHaveBeenCalledWith(null);
      expect(reloadSpy).toHaveBeenCalled();

      Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
    });
  });

  describe('passwordlessLogin', () => {
    it('GETs /passwordless-login with the token and persists the returned user', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ user: { id: 2, email: 'pl@x' } }));
      vi.stubGlobal('fetch', fetchMock);

      const setUser = vi.fn();
      const { result } = renderHook(() => useAuthentication(baseConfig({ setUser })), {
        wrapper,
      });

      let returned: unknown;
      await act(async () => {
        returned = await result.current.passwordlessLogin('magic-token');
      });

      expect(fetchMock.mock.calls[0][0]).toBe(
        'https://h/api/v1/passwordless-login?token=magic-token',
      );
      expect(returned).toEqual({ id: 2, email: 'pl@x' });
      expect(setUser).toHaveBeenCalledWith({ id: 2, email: 'pl@x' });
    });
  });
});
