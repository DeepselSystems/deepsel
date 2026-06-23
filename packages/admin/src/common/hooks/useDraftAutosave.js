import { useCallback, useEffect, useRef, useState } from 'react';
import useFetch from '../api/useFetch.js';

const DEBOUNCE_MS = 2000;

/**
 * Debounced draft autosave for blog posts and pages.
 *
 * Caller passes a snapshot-building function that returns the latest draft payload.
 * When the snapshot changes (deep-equal by JSON), we wait DEBOUNCE_MS and POST
 * to /draft/save_draft.
 *
 * `suppressNext()` is the key to preventing broadcast echo: when an incoming
 * WebSocket draft_saved event updates local form state, the consumer calls
 * suppressNext() so the next snapshot change does not trigger our own save.
 */
export default function useDraftAutosave({
  recordType,
  recordId,
  enabled,
  buildContentsPayload,
  parentFields,
}) {
  const { post } = useFetch('draft/save_draft', { autoFetch: false });
  const [status, setStatus] = useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'
  const [savedAt, setSavedAt] = useState(null);

  const lastSerializedRef = useRef(null);
  const suppressNextRef = useRef(false);
  const timerRef = useRef(null);

  const suppressNext = useCallback(() => {
    suppressNextRef.current = true;
  }, []);

  const doSave = useCallback(
    async (contents) => {
      if (!recordId || !contents?.length) return;
      setStatus('saving');
      try {
        await post({
          record_type: recordType,
          record_id: recordId,
          contents,
          parent_fields: parentFields ?? null,
        });
        setStatus('saved');
        setSavedAt(new Date());
      } catch (error) {
        console.error('Autosave failed:', error);
        setStatus('error');
      }
    },
    [post, recordType, recordId, parentFields],
  );

  /**
   * Synchronously flush the currently-pending save. Used right before publish
   * so the server draft reflects the very latest keystrokes.
   */
  const flushNow = useCallback(
    async (contents) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (contents?.length) {
        lastSerializedRef.current = JSON.stringify(contents);
        await doSave(contents);
      }
    },
    [doSave],
  );

  useEffect(() => {
    if (!enabled || !recordId) return;

    const contents = buildContentsPayload();
    if (!contents?.length) return;

    const serialized = JSON.stringify(contents);
    if (serialized === lastSerializedRef.current) return;
    lastSerializedRef.current = serialized;

    // Broadcast-echo guard: local state just changed because a peer saved,
    // not because our user typed. Swallow one cycle.
    if (suppressNextRef.current) {
      suppressNextRef.current = false;
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void doSave(contents);
    }, DEBOUNCE_MS);
    // No per-render cleanup: useFetch returns a fresh `post` every render, so
    // this effect re-runs constantly. Clearing the timer here would wipe the
    // pending save before it ever fires. Unmount cleanup lives in its own effect.
  }, [enabled, recordId, buildContentsPayload, doSave]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return { status, savedAt, suppressNext, flushNow };
}
