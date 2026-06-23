import { describe, it, expect, vi, beforeEach } from 'vitest';
import ChatBoxState from '../src/common/stores/ChatBoxState.js';
import BackendHostURLState from '../src/common/stores/BackendHostURLState.js';

function makeStreamResponse() {
  return {
    ok: true,
    body: {
      getReader: () => ({
        read: vi.fn().mockResolvedValue({ done: true, value: undefined }),
        releaseLock: vi.fn(),
      }),
    },
  };
}

describe('ChatBoxState.sendChat', () => {
  beforeEach(() => {
    ChatBoxState.setState({
      history: [],
      question: '',
      isOpen: false,
      isLoading: false,
      streamingAnswer: null,
    });
  });

  it('uses the current BackendHostURLState value for the fetch URL', async () => {
    BackendHostURLState.getState().setBackendHost('https://chat.example/api/v1');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({
          read: vi.fn().mockResolvedValue({ done: true, value: undefined }),
          releaseLock: vi.fn(),
        }),
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    await ChatBoxState.getState().sendChat('hello');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://chat.example/api/v1/chat/stream');

    vi.unstubAllGlobals();
  });

  it('picks up host changes between calls (no stale const)', async () => {
    BackendHostURLState.getState().setBackendHost('https://first.example/api/v1');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({
          read: vi.fn().mockResolvedValue({ done: true, value: undefined }),
          releaseLock: vi.fn(),
        }),
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    await ChatBoxState.getState().sendChat('first');
    BackendHostURLState.getState().setBackendHost('https://second.example/api/v1');
    await ChatBoxState.getState().sendChat('second');

    expect(fetchMock.mock.calls[0][0]).toBe('https://first.example/api/v1/chat/stream');
    expect(fetchMock.mock.calls[1][0]).toBe('https://second.example/api/v1/chat/stream');

    vi.unstubAllGlobals();
  });

  it('sends X-Frontend-Host (and X-Organization-Id when set) via createApiHeaders', async () => {
    BackendHostURLState.getState().setBackendHost('https://chat.example/api/v1');
    localStorage.setItem('organizationId', '13');

    const fetchMock = vi.fn().mockResolvedValue(makeStreamResponse());
    vi.stubGlobal('fetch', fetchMock);

    await ChatBoxState.getState().sendChat('hello');

    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['X-Frontend-Host']).toBe(window.location.hostname);
    expect(headers['X-Organization-Id']).toBe('13');

    vi.unstubAllGlobals();
  });

  it('omits X-Organization-Id when localStorage has no organizationId', async () => {
    BackendHostURLState.getState().setBackendHost('https://chat.example/api/v1');
    // localStorage is cleared by the test setup; no organizationId set.

    const fetchMock = vi.fn().mockResolvedValue(makeStreamResponse());
    vi.stubGlobal('fetch', fetchMock);

    await ChatBoxState.getState().sendChat('hello');

    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers['X-Organization-Id']).toBeUndefined();
    expect(headers['X-Frontend-Host']).toBe(window.location.hostname);

    vi.unstubAllGlobals();
  });
});
