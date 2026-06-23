import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// -- Mocks ---------------------------------------------------------------

let mockBackendHost = 'http://localhost:8000/api/v1';
let mockUser = { id: 7, name: 'tim' };
let preferencesValue = null;

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(async () => ({ value: preferencesValue })),
  },
}));

vi.mock('../src/common/stores/BackendHostURLState.js', () => ({
  default: () => ({ backendHost: mockBackendHost }),
}));

vi.mock('../src/common/api/useAuthentication.js', () => ({
  default: () => ({ user: mockUser }),
}));

import useEditSession from '../src/common/hooks/useEditSession.js';

// -- WebSocket fake -------------------------------------------------------

class FakeWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  static instances = [];

  constructor(url) {
    this.url = url;
    this.readyState = FakeWebSocket.OPEN;
    this.sent = [];
    this.closed = null;
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    FakeWebSocket.instances.push(this);
  }

  send(data) {
    this.sent.push(data);
  }

  close(code = 1000, reason = '') {
    this.readyState = FakeWebSocket.CLOSED;
    this.closed = { code, reason };
    this.onclose?.({ code, reason });
  }

  // helpers driven by tests
  fireOpen() {
    this.onopen?.();
  }
  fireMessage(payload) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
  fireClose(code, reason = '') {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code, reason });
  }
  fireError(err = new Error('ws')) {
    this.onerror?.(err);
  }
}

// jsdom / happy-dom doesn't define a WebSocket; we stub at the global level.
const wrapper = ({ children }) => <MemoryRouter>{children}</MemoryRouter>;

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function mountAndOpen(args = {}) {
  const { recordType = 'page', recordId = 'rec-1', contentId = null } = args;
  const view = renderHook(() => useEditSession(recordType, recordId, contentId), { wrapper });
  // Allow the async connect() to resolve the Preferences promise
  await act(async () => {
    await flush();
  });
  const ws = FakeWebSocket.instances.at(-1);
  return { ...view, ws };
}

describe('useEditSession', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
    mockBackendHost = 'http://localhost:8000/api/v1';
    mockUser = { id: 7, name: 'tim' };
    preferencesValue = null;
    // Silence the hook's noisy console.log/error.
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Unmount any remaining React trees BEFORE we unstub globals — otherwise
    // the hook's unmount effect (disconnect()) reads `WebSocket.OPEN` from the
    // global and throws because the global is gone.
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('WebSocket URL construction', () => {
    it('converts an absolute http:// backendHost to ws://', async () => {
      mockBackendHost = 'http://localhost:8000/api/v1';
      const { ws } = await mountAndOpen({ recordType: 'page', recordId: 12 });
      expect(ws.url.startsWith('ws://localhost:8000/api/v1/ws/edit-session?')).toBe(true);
    });

    it('converts an absolute https:// backendHost to wss://', async () => {
      mockBackendHost = 'https://example.com/api/v1';
      const { ws } = await mountAndOpen();
      expect(ws.url.startsWith('wss://example.com/api/v1/ws/edit-session?')).toBe(true);
    });

    it('resolves a relative backendHost against window.location protocol', async () => {
      mockBackendHost = '/api/v1';
      const { ws } = await mountAndOpen();
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      expect(ws.url.startsWith(`${proto}//${window.location.host}/api/v1/ws/edit-session?`)).toBe(
        true,
      );
    });

    it('includes record_type and record_id query params', async () => {
      const { ws } = await mountAndOpen({ recordType: 'page', recordId: 99 });
      const params = new URLSearchParams(ws.url.split('?')[1]);
      expect(params.get('record_type')).toBe('page');
      expect(params.get('record_id')).toBe('99');
      expect(params.has('token')).toBe(false);
      expect(params.has('content_id')).toBe(false);
    });

    it('adds the token param when Capacitor Preferences has one', async () => {
      preferencesValue = 'jwt-abc';
      const { ws } = await mountAndOpen();
      const params = new URLSearchParams(ws.url.split('?')[1]);
      expect(params.get('token')).toBe('jwt-abc');
    });

    it('adds content_id when provided', async () => {
      const { ws } = await mountAndOpen({ contentId: 'block-5' });
      const params = new URLSearchParams(ws.url.split('?')[1]);
      expect(params.get('content_id')).toBe('block-5');
    });
  });

  describe('messages and callbacks', () => {
    it('presence_update populates activeEditors', async () => {
      const { result, ws } = await mountAndOpen();
      await act(async () => {
        ws.fireOpen();
        ws.fireMessage({ type: 'presence_update', editors: [{ id: 2, name: 'a' }] });
      });
      expect(result.current.activeEditors).toEqual([{ id: 2, name: 'a' }]);
    });

    it('missing editors array is normalised to []', async () => {
      const { result, ws } = await mountAndOpen();
      await act(async () => {
        ws.fireOpen();
        ws.fireMessage({ type: 'presence_update' });
      });
      expect(result.current.activeEditors).toEqual([]);
    });

    it('invokes draft_saved / published / unpublished handlers with the payload', async () => {
      const onDraft = vi.fn();
      const onPub = vi.fn();
      const onUnpub = vi.fn();
      const { result, ws } = await mountAndOpen();
      act(() => {
        result.current.onDraftSaved(onDraft);
        result.current.onPublished(onPub);
        result.current.onUnpublished(onUnpub);
      });
      await act(async () => {
        ws.fireOpen();
        ws.fireMessage({ type: 'draft_saved', fields: { title: 'x' } });
        ws.fireMessage({ type: 'published' });
        ws.fireMessage({ type: 'unpublished' });
      });
      expect(onDraft).toHaveBeenCalledWith({ type: 'draft_saved', fields: { title: 'x' } });
      expect(onPub).toHaveBeenCalledWith({ type: 'published' });
      expect(onUnpub).toHaveBeenCalledWith({ type: 'unpublished' });
    });

    it('handles malformed message payloads without throwing', async () => {
      const { ws } = await mountAndOpen();
      await act(async () => {
        ws.onmessage?.({ data: 'not-json' });
      });
      // Nothing to assert except that the test did not throw.
      expect(ws.readyState).toBe(FakeWebSocket.OPEN);
    });
  });

  describe('reconnect on abnormal close', () => {
    it('reconnects with exponential backoff when close code != 1000', async () => {
      vi.useFakeTimers();
      const { ws } = await mountAndOpen();

      // Abnormal close (e.g. 1006). Hook should schedule a reconnect after ~1s.
      await act(async () => {
        ws.fireClose(1006);
      });
      expect(FakeWebSocket.instances.length).toBe(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
        await flush();
      });
      expect(FakeWebSocket.instances.length).toBe(2);

      // Second close triggers a 2s backoff
      await act(async () => {
        FakeWebSocket.instances[1].fireClose(1006);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
        await flush();
      });
      expect(FakeWebSocket.instances.length).toBe(3);
    });

    it('does NOT reconnect on a clean close (code 1000)', async () => {
      vi.useFakeTimers();
      const { ws } = await mountAndOpen();
      await act(async () => {
        ws.fireClose(1000);
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(FakeWebSocket.instances.length).toBe(1);
    });
  });

  describe('disconnect', () => {
    it('sends leave_edit_session before close on unmount', async () => {
      const { ws, unmount } = await mountAndOpen({
        recordType: 'page',
        recordId: 'r1',
        contentId: 'c1',
      });
      ws.fireOpen();

      await act(async () => {
        unmount();
        await flush();
      });

      const leave = ws.sent.map((s) => JSON.parse(s)).find((m) => m.type === 'leave_edit_session');
      expect(leave).toEqual({
        type: 'leave_edit_session',
        record_type: 'page',
        record_id: 'r1',
        content_id: 'c1',
      });
    });
  });

  describe('beforeunload beacon', () => {
    it('sends a beacon with the record/user payload on beforeunload', async () => {
      const sendBeacon = vi.fn().mockReturnValue(true);
      Object.defineProperty(window.navigator, 'sendBeacon', {
        value: sendBeacon,
        configurable: true,
        writable: true,
      });

      await mountAndOpen({ recordType: 'post', recordId: 5, contentId: null });

      await act(async () => {
        window.dispatchEvent(new Event('beforeunload'));
      });

      expect(sendBeacon).toHaveBeenCalledTimes(1);
      const [url, payload] = sendBeacon.mock.calls[0];
      expect(url).toBe(`${mockBackendHost}/edit-session/leave`);
      expect(JSON.parse(payload)).toEqual({
        record_type: 'post',
        record_id: 5,
        content_id: null,
        user_id: 7,
      });
    });

    it('does not beacon when user is missing', async () => {
      const sendBeacon = vi.fn().mockReturnValue(true);
      Object.defineProperty(window.navigator, 'sendBeacon', {
        value: sendBeacon,
        configurable: true,
        writable: true,
      });
      mockUser = null;

      renderHook(() => useEditSession('page', 1), { wrapper });
      await act(async () => {
        await flush();
        window.dispatchEvent(new Event('beforeunload'));
      });

      expect(sendBeacon).not.toHaveBeenCalled();
    });
  });
});
