import { reconcileSettings, hasSettingsVersion } from '../../../shared/lib/settings-sync.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE } from '../../../shared/api/base.js';
import { apiFetch, parseResponseMessage } from '../../../shared/api/client.js';
import {
  LLM_SETTINGS_STORAGE_KEY,
  applyLlmSettingsPayloadToDraft,
  llmDraftForStorage,
  loadLlmSettingsDraft,
  mergeLlmSettingsDraft,
  runtimeLlmProviderOptions,
} from '../model/llm-settings.js';

// Execution reads saved settings. The editor's unsaved fields are a separate
// draft; neither a background GET nor a successful PUT may erase newer edits.
export function useLlmSettings({ draft, setDraft, settingsOpen, refreshEpoch = 0 }) {
  const [saved, setSaved] = useState(loadLlmSettingsDraft);
  const savedRef = useRef(saved);
  savedRef.current = saved;
  const current = useRef({ draft, setDraft });
  current.current = { draft, setDraft };
  const mounted = useRef(false);
  const request = useRef(null);
  const retryTimer = useRef(null);
  const revision = useRef(0);
  const writes = useRef(new Set());
  const committedWrite = useRef(0);

  const cancelRead = useCallback(() => {
    request.current?.abort();
    request.current = null;
    if (retryTimer.current !== null) window.clearTimeout(retryTimer.current);
    retryTimer.current = null;
  }, []);

  const applySaved = useCallback((payload, baseline) => {
    const normalized = applyLlmSettingsPayloadToDraft({}, payload);
    // An empty catalog is authoritative too (e.g. deleting the last record).
    if (!Object.hasOwn(normalized, 'profiles')) throw new Error('Invalid model configuration response.');
    savedRef.current = normalized;
    setSaved(normalized);
    current.current.setDraft(previous => hasSettingsVersion(payload, 'llm')
      ? reconcileSettings('llm', previous, normalized, payload)
      : mergeLlmSettingsDraft(previous, normalized, baseline));
    try {
      window.localStorage?.setItem(LLM_SETTINGS_STORAGE_KEY, llmDraftForStorage(normalized));
    } catch {
      // Backend success and this session remain valid when local storage is full.
    }
  }, []);

  const refresh = useCallback(async (attempt = 0) => {
    cancelRead();
    if (!mounted.current || writes.current.size) return;
    const controller = new AbortController();
    request.current = controller;
    const expectedRevision = revision.current;
    const baseline = savedRef.current;
    const isCurrent = () => mounted.current && request.current === controller
      && !controller.signal.aborted && revision.current === expectedRevision;
    try {
      const response = await apiFetch(`${API_BASE}/api/settings/llm`, {
        method: 'GET', cache: 'no-store', signal: controller.signal,
      }, { json: false });
      if (!response.ok) throw new Error(await parseResponseMessage(response, `Model configurations could not be loaded (${response.status}).`));
      const payload = await response.json();
      if (isCurrent()) applySaved(payload, baseline);
    } catch (error) {
      if (!isCurrent()) return;
      // The desktop renderer can mount before the local runtime is ready.
      if (attempt < 8) {
        retryTimer.current = window.setTimeout(() => {
          retryTimer.current = null;
          void refresh(attempt + 1);
        }, Math.min(400 * (attempt + 1), 2000));
      } else {
        console.warn('failed to fetch llm settings', error);
      }
    }
  }, [applySaved, cancelRead]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; cancelRead(); };
  }, [cancelRead]);
  // This runs on startup even when Settings has never been opened. Reopening
  // Providers refreshes the same catalog, rather than being its first load.
  useEffect(() => {
    void refresh();
    return cancelRead;
  }, [settingsOpen, refreshEpoch, refresh, cancelRead]);

  const beginWrite = useCallback((baseline) => {
    cancelRead();
    const generation = ++revision.current;
    writes.current.add(generation);
    let finished = false;
    return payload => {
      if (finished) return;
      finished = true;
      writes.current.delete(generation);
      if (!mounted.current) return;
      if (payload !== undefined) {
        if (generation >= committedWrite.current) {
          applySaved(payload, baseline);
          committedWrite.current = generation;
        }
      } else if (!writes.current.size) {
        // A failed write must not leave startup hydration permanently aborted.
        void refresh();
      }
    };
  }, [applySaved, cancelRead, refresh]);

  const providerOptions = useMemo(() => runtimeLlmProviderOptions(saved), [saved]);
  return { providerOptions, beginWrite };
}
