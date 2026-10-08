import { useEffect, useRef } from 'react';
import { createLiveToolsLoader } from '../model/live-tools-settings.js';

// One loader per visible Settings/workspace context. Page selection is not its
// identity: switching Skill children must neither abort nor restart discovery.
export function useLiveToolsSettings({ enabled, contextKey, busy, refreshRef, cache, fetchPayload, onPayload, onState }) {
  const callbacks = useRef({ fetchPayload, onPayload, onState });
  callbacks.current = { fetchPayload, onPayload, onState };
  useEffect(() => {
    if (!enabled || busy) return undefined;
    const cached = cache.get(contextKey);
    const loader = createLiveToolsLoader({
      cachedPayload: cached ? { skills: cached } : undefined,
      fetchPayload: signal => callbacks.current.fetchPayload(signal),
      onPayload: payload => {
        cache.set(contextKey, payload.skills);
        callbacks.current.onPayload(payload);
      },
      onState: state => callbacks.current.onState({ ...state, key: contextKey }),
    });
    const refresh = () => loader.refresh();
    refreshRef.current = refresh;
    void refresh();
    window.addEventListener('focus', refresh);
    return () => {
      loader.dispose();
      window.removeEventListener('focus', refresh);
      if (refreshRef.current === refresh) refreshRef.current = null;
    };
  }, [enabled, contextKey, busy, refreshRef, cache]);
}
