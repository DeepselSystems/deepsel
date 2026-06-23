import { useEffect, useRef, useState } from 'react';
import { Preferences } from '@capacitor/preferences';
import BackendHostURLState from '../stores/BackendHostURLState.js';
import useAuthentication from '../api/useAuthentication.js';

/**
 * WebSocket-backed edit session.
 *
 * Emits presence updates (the full list of other editors), plus live events:
 *   - draft_saved: another user autosaved; payload has the updated draft fields
 *   - published:   another user promoted the draft to live
 *   - unpublished: another user toggled published off
 *
 * All events are delivered through subscribe callbacks so the caller controls
 * how state is merged. We don't own the form state here.
 */
export default function useEditSession(recordType, recordId, contentId = null) {
  const { backendHost } = BackendHostURLState();
  const { user } = useAuthentication();
  const [isConnected, setIsConnected] = useState(false);
  const [activeEditors, setActiveEditors] = useState([]);
  const [isWebSocketSupported, setIsWebSocketSupported] = useState(true);

  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;

  // Subscription callbacks, registered by consumers
  const draftSavedHandlerRef = useRef(null);
  const publishedHandlerRef = useRef(null);
  const unpublishedHandlerRef = useRef(null);

  const onDraftSaved = (cb) => {
    draftSavedHandlerRef.current = cb;
  };
  const onPublished = (cb) => {
    publishedHandlerRef.current = cb;
  };
  const onUnpublished = (cb) => {
    unpublishedHandlerRef.current = cb;
  };

  const connect = async () => {
    if (!recordType || !recordId || !user) {
      console.log('[useEditSession] skip connect (missing params)', {
        recordType,
        recordId,
        hasUser: !!user,
      });
      return;
    }
    try {
      // Auth: the web admin uses httpOnly session cookies which the browser sends
      // automatically on the WS handshake. Mobile/hybrid clients store a JWT in
      // Capacitor Preferences; include it in the query if present.
      const tokenResult = await Preferences.get({ key: 'token' });

      // backendHost may be absolute ("http://localhost:8000/api/v1") or a same-origin
      // relative path ("/api/v1"). WebSocket needs an absolute ws:// or wss:// URL,
      // so resolve relative paths against window.location.
      let wsHost;
      if (/^https?:\/\//i.test(backendHost)) {
        wsHost = backendHost.replace(/^http:\/\//i, 'ws://').replace(/^https:\/\//i, 'wss://');
      } else {
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        wsHost = `${proto}//${window.location.host}${backendHost || ''}`;
      }
      const params = new URLSearchParams({
        record_type: recordType,
        record_id: recordId.toString(),
      });
      if (tokenResult?.value) params.append('token', tokenResult.value);
      if (contentId) params.append('content_id', contentId.toString());

      const wsUrl = `${wsHost}/ws/edit-session?${params.toString()}`;
      console.log('[useEditSession] opening', wsUrl);
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[useEditSession] connected', { recordType, recordId });
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;

        const heartbeatInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'heartbeat' }));
          } else {
            clearInterval(heartbeatInterval);
          }
        }, 30000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[useEditSession] message', data.type, data);
          if (data.type === 'presence_update') {
            setActiveEditors(data.editors || []);
          } else if (data.type === 'draft_saved') {
            draftSavedHandlerRef.current?.(data);
          } else if (data.type === 'published') {
            publishedHandlerRef.current?.(data);
          } else if (data.type === 'unpublished') {
            unpublishedHandlerRef.current?.(data);
          }
        } catch (error) {
          console.error('WebSocket message parse error:', error);
        }
      };

      ws.onclose = (event) => {
        console.log('[useEditSession] closed', { code: event.code, reason: event.reason });
        setIsConnected(false);
        wsRef.current = null;
        if (event.code !== 1000 && reconnectAttemptsRef.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current++;
            connect();
          }, delay);
        }
      };

      ws.onerror = (error) => {
        console.error('[useEditSession] error', error);
        if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
          setIsWebSocketSupported(false);
        }
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('WebSocket connect error:', error);
    }
  };

  const disconnect = async () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(
          JSON.stringify({
            type: 'leave_edit_session',
            record_type: recordType,
            record_id: recordId,
            content_id: contentId,
          }),
        );
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (_err) {
        /* noop */
      }
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close(1000, 'User disconnected');
      }
    }
    wsRef.current = null;
    setIsConnected(false);
    setActiveEditors([]);
  };

  useEffect(() => {
    if (isWebSocketSupported) connect();
    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordType, recordId, contentId, backendHost, user?.id, isWebSocketSupported]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (recordType && recordId && user) {
        try {
          navigator.sendBeacon(
            `${backendHost}/edit-session/leave`,
            JSON.stringify({
              record_type: recordType,
              record_id: recordId,
              content_id: contentId,
              user_id: user.id,
            }),
          );
        } catch (_err) {
          /* noop */
        }
      }
    };
    const handlePageHide = () => disconnect();
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordType, recordId, contentId, user?.id, backendHost]);

  return {
    isConnected,
    activeEditors,
    onDraftSaved,
    onPublished,
    onUnpublished,
    reconnect: connect,
    disconnect,
  };
}
