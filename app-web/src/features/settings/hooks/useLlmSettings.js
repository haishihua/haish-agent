import { reconcileSettings, hasSettingsVersion } from '../../../shared/lib/settings-sync.js';
import { retryWithBackoff, STARTUP_LOAD_RETRY } from '../../../shared/lib/retry-with-backoff.js';
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
  const [catalogReady, setCatalogReady] = useState(false);
  const catalogReadyRef = useRef(false);
  const updateCatalogReady = useCallback((value) => {
    if (catalogReadyRef.current === value) return;
    catalogReadyRef.current = value;
    setCatalogReady(value);
  }, []);
  const savedRef = useRef(saved);
  savedRef.current = saved;
  const current = useRef({ draft, setDraft });
  current.current = { draft, setDraft };
  const mounted = useRef(false);
  const request = useRef(null);
  const stopRetry = useRef(null);
  const revision = useRef(0);
  const writes = useRef(new Set());
  const committedWrite = useRef(0);

  const cancelRead = useCallback(() => {
    request.current?.abort();
    request.current = null;
    // 排队中的重试也要一起停：放弃读取时不该再自己回来。
    stopRetry.current?.();
    stopRetry.current = null;
  }, []);

  const applySaved = useCallback((payload, baseline) => {
    const normalized = applyLlmSettingsPayloadToDraft({}, payload);
    // An empty catalog is authoritative too (e.g. deleting the last record).
    if (!Object.hasOwn(normalized, 'profiles')) throw new Error('Invalid model configuration response.');
    savedRef.current = normalized;
    setSaved(normalized);
    updateCatalogReady(true);
    current.current.setDraft(previous => hasSettingsVersion(payload, 'llm')
      ? reconcileSettings('llm', previous, normalized, payload)
      : mergeLlmSettingsDraft(previous, normalized, baseline));
    try {
      window.localStorage?.setItem(LLM_SETTINGS_STORAGE_KEY, llmDraftForStorage(normalized));
    } catch {
      // Backend success and this session remain valid when local storage is full.
    }
  }, [updateCatalogReady]);

  const loadSaved = useCallback(async () => {
    // 每次重试都重算这两道门：等待期间开始的写或卸载，都比这次读取新。
    if (!mounted.current || writes.current.size) return;
    updateCatalogReady(false);
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
      // 旧请求/已卸载不算失败：既不重试也不报告。
      if (!isCurrent()) return;
      throw error;
    }
  }, [applySaved, updateCatalogReady]);

  const refresh = useCallback(() => {
    cancelRead();
    if (!mounted.current || writes.current.size) return;
    stopRetry.current = retryWithBackoff(loadSaved, {
      ...STARTUP_LOAD_RETRY,
      onExhausted: (error) => console.warn('failed to fetch llm settings', error),
      // 定时器走 window：卸载时 cancelRead 要能按 id 清掉排队中的重试。
      schedule: (callback, ms) => window.setTimeout(callback, ms),
      cancel: (handle) => window.clearTimeout(handle),
    });
  }, [cancelRead, loadSaved]);

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
    updateCatalogReady(false);
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
  }, [applySaved, cancelRead, refresh, updateCatalogReady]);

  const providerOptions = useMemo(() => runtimeLlmProviderOptions(saved), [saved]);
  return { providerOptions, catalogReady, beginWrite };
}
