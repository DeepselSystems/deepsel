import { useState } from 'react';
import { Preferences } from '@capacitor/preferences';
import { Device } from '@capacitor/device';
import { useNetwork } from '@mantine/hooks';
import { useLocation } from 'react-router-dom';
import { useDeviceData } from 'react-device-detect';
import { v4 as uuidv4 } from 'uuid';
import type { User } from '../types';
import { formatErrorDetail } from '../formatErrorDetail';

export type { User };

/** Default organization ID used as fallback when the stored org is stale or missing */
const DEFAULT_ORGANIZATION_ID = 1;

/** Capacitor Preferences key for persisted user data */
const PREFERENCE_KEY_USER_DATA = 'userData';

/** Capacitor Preferences key for the anonymous session identifier */
const PREFERENCE_KEY_ANONYMOUS_ID = 'anonymousId';

/** Error detail string returned by the backend when org membership check fails */
const NOT_ORG_MEMBER_DETAIL = 'User is not a member of the requested organization';

// ─── Request inputs ───────────────────────────────────────────────────────────

export interface LoginCredentials {
  identifier: string;
  password: string;
  otp?: string;
}

export interface SignupCredentials {
  email: string;
  password: string;
}

// ─── Server response shapes ───────────────────────────────────────────────────

export interface LoginResponse {
  is_require_user_config_2fa?: boolean;
  access_token?: string;
  user?: User;
}

export interface LoginOrganizationItem {
  id: number;
  name: string;
}

export interface LoginOrganizationsResponse {
  organizations: LoginOrganizationItem[];
  last_used_organization_id: number | null;
}

// ─── Hook config & return contract ───────────────────────────────────────────

export interface UseAuthenticationConfig {
  backendHost: string;
  user: User | null;
  setUser: (user: User | null) => void;
  organizationId?: number;
  setOrganizationId?: (id: number) => void;
  setCookie?: (name: string, value: string, days: number) => void;
  removeCookie?: (name: string) => void;
}

export interface UseAuthenticationReturn {
  user: User | null;
  setUser: (user: User | null) => void;
  saveUserData: (userData: User) => Promise<void>;
  initUser: () => Promise<unknown>;
  fetchUserData: () => Promise<User>;
  fetchUser: () => Promise<void>;
  fetchLoginOrganizations: (username: string) => Promise<LoginOrganizationsResponse>;
  login: (credentials: LoginCredentials) => Promise<User | { is_require_user_config_2fa: boolean }>;
  signup: (credentials: SignupCredentials, autoLogin?: boolean) => Promise<unknown>;
  logout: () => Promise<never>;
  passwordlessLogin: (passwordlessToken: string) => Promise<User>;
  loading: boolean;
  error: string | null;
}

/**
 * Hook for managing user authentication — login, signup, logout, session persistence.
 *
 * Uses httpOnly session cookies for auth (set by the server).
 * Token is never stored client-side — the cookie is managed by the browser automatically.
 */
export function useAuthentication(config: UseAuthenticationConfig): UseAuthenticationReturn {
  const { backendHost, user, setUser, organizationId, setOrganizationId } = config;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const network = useNetwork();
  const location = useLocation();
  const deviceData = useDeviceData(navigator.userAgent);

  const getErrorMessage = async (res: Response, fallback: string): Promise<string> => {
    try {
      const body = await res.json();
      return formatErrorDetail(body.detail);
    } catch {
      return fallback;
    }
  };

  /**
   * Persists user data to state and Capacitor Preferences.
   */
  async function saveUserData(userData: User): Promise<void> {
    setUser(userData);
    await Preferences.set({ key: PREFERENCE_KEY_USER_DATA, value: JSON.stringify(userData) });
  }

  /**
   * Initializes an anonymous user session with device and location metadata.
   */
  async function initUser(): Promise<unknown> {
    const deviceInfo = await Device.getInfo();
    const deviceInfoExtended = {
      ...deviceInfo,
      location,
      referrer: document.referrer,
      user_agent: navigator.userAgent,
      network,
      os_version: deviceInfo.osVersion === 'unknown' ? deviceData.os.name : deviceInfo.osVersion,
      browser: deviceData.browser,
      cpu: deviceData.cpu,
    };

    let anonymousId = (await Preferences.get({ key: PREFERENCE_KEY_ANONYMOUS_ID })).value;
    if (!anonymousId) {
      anonymousId = uuidv4();
      await Preferences.set({ key: PREFERENCE_KEY_ANONYMOUS_ID, value: anonymousId });
    }

    const res = await fetch(`${backendHost}/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        device_info: deviceInfoExtended,
        ...(organizationId != null && { organization_id: organizationId }),
        anonymous_id: anonymousId,
      }),
    });
    return res.json();
  }

  /**
   * Fetches the current user profile from the backend.
   */
  async function fetchUserData(): Promise<User> {
    const response = await fetch(`${backendHost}/user/util/me`, {
      credentials: 'include',
    });
    if (response.status !== 200) {
      const { detail } = await response.json();
      const message = formatErrorDetail(detail);
      setError(message);
      throw new Error(message);
    }
    return response.json();
  }

  /**
   * Fetches the current user profile and persists it to state.
   */
  async function fetchUser(): Promise<void> {
    const userData = await fetchUserData();
    await saveUserData(userData);
  }

  /**
   * Fetch the list of organizations a username belongs to, for use in the
   * org-selector step before password entry. Returns empty list on unknown user.
   *
   * Requires `POST /login/organizations` on the backend — app-level endpoint, not in deepsel package.
   */
  async function fetchLoginOrganizations(username: string): Promise<LoginOrganizationsResponse> {
    try {
      const res = await fetch(`${backendHost}/login/organizations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `username=${encodeURIComponent(username)}`,
      });
      if (!res.ok) {
        return { organizations: [], last_used_organization_id: null };
      }
      return res.json();
    } catch {
      return { organizations: [], last_used_organization_id: null };
    }
  }

  /**
   * Authenticates the user with identifier, password, and optional OTP.
   */
  async function login(
    credentials: LoginCredentials,
  ): Promise<User | { is_require_user_config_2fa: boolean }> {
    try {
      setLoading(true);
      const { identifier, password, otp = '' } = credentials;
      const encodedIdentifier = encodeURIComponent(identifier);
      const encodedPassword = encodeURIComponent(password);

      const attemptLogin = async (orgId: number | undefined) => {
        const baseBody = `username=${encodedIdentifier}&password=${encodedPassword}&otp=${otp}`;
        const body = orgId ? `${baseBody}&organization_id=${orgId}` : baseBody;
        const res = await fetch(`${backendHost}/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          credentials: 'include',
          body,
        });
        if (res.ok) {
          return { ok: true as const, data: (await res.json()) as LoginResponse };
        }
        return {
          ok: false as const,
          status: res.status,
          detail: await getErrorMessage(res, 'Login failed'),
        };
      };

      let result = await attemptLogin(organizationId);

      // Stored organizationId can become stale if the org was deleted or the
      // user was removed from it. Retry once with the default org id 1 before
      // surfacing the error.
      if (
        !result.ok &&
        result.status === 403 &&
        result.detail === NOT_ORG_MEMBER_DETAIL &&
        organizationId !== DEFAULT_ORGANIZATION_ID
      ) {
        const retry = await attemptLogin(DEFAULT_ORGANIZATION_ID);
        if (retry.ok) {
          setOrganizationId?.(DEFAULT_ORGANIZATION_ID);
          result = retry;
        }
      }

      if (!result.ok) {
        setError(result.detail);
        throw new Error(result.detail);
      }

      const responseData: LoginResponse = result.data;
      const { is_require_user_config_2fa, user: userData } = responseData || {};

      if (is_require_user_config_2fa) {
        return { is_require_user_config_2fa };
      }

      if (!userData) {
        throw new Error('Invalid response from server');
      }

      await saveUserData(userData);
      return userData;
    } finally {
      setLoading(false);
    }
  }

  /**
   * Registers a new user account and optionally auto-logs in.
   */
  async function signup(credentials: SignupCredentials, autoLogin = true): Promise<unknown> {
    try {
      setLoading(true);
      const { email, password } = credentials;
      const response = await fetch(`${backendHost}/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email,
          password,
          organization_id: organizationId,
        }),
      });

      if (!response.ok) {
        const message = await getErrorMessage(response, 'Signup failed');
        setError(message);
        throw new Error(message);
      }

      if (autoLogin) {
        return login({ identifier: email, password });
      } else {
        return response.json();
      }
    } finally {
      setLoading(false);
    }
  }

  /**
   * Invalidates the server session, clears local state, and either navigates to
   * the IdP's end-session page (SSO sessions) or reloads (local sessions).
   *
   * We always hit `/logout/oidc`: it clears the local session exactly like
   * `/logout` does, and for SSO sessions returns the IdP `end_session_endpoint`
   * URL in `logout_url`. That URL MUST be reached by a top-level navigation, not
   * a `fetch()` — otherwise the IdP's own SSO cookie survives and the next
   * "Login with SSO" click silently re-authenticates the previous user.
   * Apps without the OIDC route (404) fall back to the core `/logout`.
   */
  async function logout(): Promise<never> {
    let logoutUrl: string | null = null;
    try {
      const res = await fetch(`${backendHost}/logout/oidc`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        logoutUrl = data?.logout_url ?? null;
      } else {
        // No OIDC route in this app — fall back to the core logout.
        await fetch(`${backendHost}/logout`, { method: 'POST', credentials: 'include' });
      }
    } catch {
      // Best effort — proceed with local cleanup even if server is unreachable
    }

    await Preferences.remove({ key: PREFERENCE_KEY_USER_DATA });
    setUser(null);
    if (logoutUrl) {
      window.location.href = logoutUrl;
    } else {
      window.location.reload();
    }
    throw new Error('Unauthorized');
  }

  /**
   * Completes a passwordless login using a one-time token from email.
   */
  async function passwordlessLogin(passwordlessToken: string): Promise<User> {
    try {
      setLoading(true);
      const response = await fetch(`${backendHost}/passwordless-login?token=${passwordlessToken}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        const message = await getErrorMessage(response, 'Login failed');
        setError(message);
        throw new Error(message);
      }

      const responseData: LoginResponse = await response.json();
      const { user: userData } = responseData || {};

      if (!userData) {
        throw new Error('Invalid response from server');
      }

      await saveUserData(userData);
      return userData;
    } finally {
      setLoading(false);
    }
  }

  return {
    user,
    setUser,
    saveUserData,
    initUser,
    fetchUserData,
    fetchUser,
    fetchLoginOrganizations,
    login,
    signup,
    logout,
    passwordlessLogin,
    loading,
    error,
  };
}
