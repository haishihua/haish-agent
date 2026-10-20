import { hasSettingsVersion } from '../../../shared/lib/settings-sync.js';
import { useEffect, useRef } from 'react';
import { createLiveToolsLoader } from '../model/live-tools-settings.js';

// One loader per visible Settings/workspace context. Page selection is not its
// identity: switching Skill children must neither abort nor restart discovery.
export function useLiveToolsSettings({ enabled, contextKey, busy, refreshRef, cache, records, fetchPayload, onPayload, onState, refreshEpoch = 0, pageKey = '' }) {
  const callbacks = useRef({ records, fetchPayload, onPayload, onState });
  callbacks.current = { records, fetchPayload, onPayload, onState };
  const configurationInitialized = useRef(false);
  const initializationRecords = useRef(null);
  const pendingWrites = useRef(0);
  const deferredConfiguration = useRef(null);
  useEffect(() => {
    if (!enabled || busy) return undefined;
    const cached = cache.get(contextKey);
    const loader = createLiveToolsLoader({
      cachedPayload: cached ? { skills: cached } : undefined,
      fetchPayload: signal => {
        if (!configurationInitialized.current && !initializationRecords.current) {
          initializationRecords.current = { records: callbacks.current.records };
        }
        return callbacks.current.fetchPayload(signal);
      },
      onPayload: payload => {
        cache.set(contextKey, payload.skills);
        // Versioned runtimes reconcile saved configuration without erasing
        // drafts. Old runtimes retain inventory-only refresh after hydration.
        if (hasSettingsVersion(payload, 'mcp')) {
          configurationInitialized.current = true;
          callbacks.current.onPayload(payload);
        } else if (!configurationInitialized.current && (payload.mcp || payload.web_search)) {
          if (pendingWrites.current) {
            deferredConfiguration.current = { mcp: payload.mcp, web_search: payload.web_search };
            callbacks.current.onPayload({ skills: payload.skills });
          } else {
            configurationInitialized.current = true;
            callbacks.current.onPayload(payload, initializationRecords.current?.records);
          }
        } else {
          callbacks.current.onPayload({ skills: payload.skills });
        }
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
  }, [enabled, contextKey, busy, refreshRef, cache, refreshEpoch, pageKey]);
  // Pause first-GET hydration at PUT start, so it cannot look like an edit to
  // the write's baseline. Success owns initialization; failure releases any
  // deferred configuration using the original GET baseline to protect edits.
  return () => {
    pendingWrites.current += 1;
    return saved => {
      pendingWrites.current -= 1;
      if (saved) {
        configurationInitialized.current = true;
        deferredConfiguration.current = null;
      } else if (!pendingWrites.current && !configurationInitialized.current && deferredConfiguration.current) {
        const payload = deferredConfiguration.current;
        deferredConfiguration.current = null;
        configurationInitialized.current = true;
        callbacks.current.onPayload(payload, initializationRecords.current?.records);
      }
    };
  };
}
