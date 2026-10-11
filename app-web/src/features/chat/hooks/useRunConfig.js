import React from 'react';
import { API_BASE } from '../../../shared/api/base.js';
import { apiFetch } from '../../../shared/api/client.js';
import { REASONING_EFFORT_OPTIONS, normalizeReasoningEffort } from '../model/run-catalog.js';

const PROVIDER_MODELS_STORAGE_KEY = 'haish_provider_models_v1';

function preferredStorageKeyFromSelectionKey(storageKey) {
  const key = String(storageKey || '').trim();
  if (!key) return '';
  // Conversation keys: haish_run_config_v1:<owner>:<mode>:<conversation>[.bot]
  // Preferred keys:    haish_preferred_run_config_v1:<owner>:<mode>[.bot]
  const match = key.match(/^(haish_run_config_v1):([^:]+):([^:]+):([^:.]+)(\.bot)?$/);
  if (!match) return '';
  const [, , ownerHash, modeHash, , botSuffix = ''] = match;
  return `haish_preferred_run_config_v1:${ownerHash}:${modeHash}${botSuffix}`;
}

function safeReadRunConfigSelection(storageKey) {
  if (!storageKey || typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      agentId: typeof parsed.agentId === 'string' ? parsed.agentId : '',
      modelId: typeof parsed.modelId === 'string' ? parsed.modelId : '',
      providerId: typeof parsed.providerId === 'string' ? parsed.providerId : '',
      providerDefaultModelId: typeof parsed.providerDefaultModelId === 'string' ? parsed.providerDefaultModelId : '',
      reasoningEffort: parsed.reasoningEffort,
    };
  } catch (_) {
    return null;
  }
}

export function safeWriteRunConfigSelection(storageKey, selection) {
  if (!storageKey || typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify({
      agentId: selection.agentId,
      modelId: selection.modelId,
      providerId: selection.providerId,
      providerDefaultModelId: selection.providerDefaultModelId,
      reasoningEffort: selection.reasoningEffort,
    }));
  } catch (_) {
    // Selection still works for this session if storage is unavailable.
  }
}

function optionHasId(options, id) {
  return Array.isArray(options) && options.some((item) => item?.id === id);
}

function providerModelsRequest(providerOption) {
  if (!providerOption?.provider) return null;
  return {
    provider: providerOption.provider,
    auth_mode: providerOption.authMode || '',
    custom_provider: providerOption.customProvider || '',
    base_url: providerOption.baseUrl || '',
    model: providerOption.defaultModelId || '',
    custom_model_ids: providerOption.customModelIds || [],
    refresh: true,
  };
}

function normalizeProviderModels(payload) {
  const seen = new Set();
  const options = [];
  (Array.isArray(payload?.models) ? payload.models : []).forEach((item) => {
    const id = String(typeof item === 'string' ? item : item?.id || '').trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    options.push({ id, label: String(typeof item === 'string' ? item : item?.label || id).trim() || id });
  });
  const requestedDefault = String(payload?.default_model || '').trim();
  return {
    options,
    defaultModelId: options.some((item) => item.id === requestedDefault) ? requestedDefault : (options[0]?.id || ''),
  };
}

function readProviderModelsCache(requestKey) {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const cache = JSON.parse(window.localStorage.getItem(PROVIDER_MODELS_STORAGE_KEY) || '{}');
    const catalog = cache?.[requestKey];
    if (!catalog) return null;
    return normalizeProviderModels({ models: catalog.options, default_model: catalog.defaultModelId });
  } catch (_) {
    return null;
  }
}

function writeProviderModelsCache(requestKey, catalog) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const cache = JSON.parse(window.localStorage.getItem(PROVIDER_MODELS_STORAGE_KEY) || '{}');
    cache[requestKey] = catalog;
    window.localStorage.setItem(PROVIDER_MODELS_STORAGE_KEY, JSON.stringify(cache));
  } catch (_) {
    // The live catalog remains usable when storage is unavailable.
  }
}

export function useProviderModels(providerOption) {
  const providerId = providerOption?.id || '';
  const requestKey = JSON.stringify(providerModelsRequest(providerOption));
  const fallbackKey = JSON.stringify({
    models: providerOption?.modelOptions || [],
    default_model: providerOption?.defaultModelId || '',
  });
  const [state, setState] = React.useState({ providerId: '', options: [], defaultModelId: '', loading: false });

  React.useEffect(() => {
    const request = JSON.parse(requestKey);
    const fallback = normalizeProviderModels(JSON.parse(fallbackKey));
    if (!providerId || !request) {
      setState({ providerId: '', options: [], defaultModelId: '', loading: false });
      return undefined;
    }
    let cancelled = false;
    const controller = new AbortController();
    const cached = readProviderModelsCache(requestKey);
    setState({ providerId, ...(cached || fallback), loading: true });
    apiFetch(`${API_BASE}/api/llm/models`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: requestKey,
      signal: controller.signal,
    }, { json: false })
      .then(async (response) => {
        if (!response.ok) throw new Error(`provider models fetch failed: ${response.status}`);
        const payload = await response.json();
        const responseProvider = String(payload?.provider || '').trim();
        if (responseProvider && responseProvider !== request.provider) {
          throw new Error(`provider models mismatch: expected ${request.provider}, received ${responseProvider}`);
        }
        return normalizeProviderModels(payload);
      })
      .then((catalog) => {
        if (cancelled) return;
        const resolved = catalog.options.length ? catalog : (cached || fallback);
        if (catalog.options.length) writeProviderModelsCache(requestKey, catalog);
        setState({ providerId, ...resolved, loading: false });
      })
      .catch((error) => {
        if (cancelled || error?.name === 'AbortError') return;
        console.warn('failed to fetch selected provider models', error);
        setState({ providerId, ...(cached || fallback), loading: false });
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [providerId, requestKey, fallbackKey]);

  if (state.providerId !== providerId) {
    return { options: [], defaultModelId: '', loading: Boolean(providerId) };
  }
  return state;
}

export function resolveRunConfigSelection(storageKey, providerOptions, agentOptions, defaultAgentId) {
  const stored = safeReadRunConfigSelection(storageKey);
  const preferredKey = preferredStorageKeyFromSelectionKey(storageKey);
  const preferred = preferredKey ? safeReadRunConfigSelection(preferredKey) : null;
  // Conversation-local config wins; otherwise fall back to the user's last pick
  // so a new chat keeps the previously selected agent (e.g. Simple Agent).
  const agentSource = optionHasId(agentOptions, stored?.agentId)
    ? stored
    : (optionHasId(agentOptions, preferred?.agentId) ? preferred : null);
  const providerSource = stored || (optionHasId(providerOptions, preferred?.providerId) ? preferred : null);
  const providerId = providerSource?.providerId || '';
  const provider = (providerOptions || []).find((item) => item.id === providerId);
  const providerDefaultModelId = String(provider?.defaultModelId || '').trim();
  return {
    providerId,
    modelId: providerSource?.modelId || '',
    providerDefaultModelId,
    agentId: agentSource?.agentId || defaultAgentId,
    reasoningEffort: normalizeReasoningEffort(providerSource?.reasoningEffort, provider?.defaultReasoningEffort),
  };
}

/**
 * 该会话（或该模式）真正存过的选择 → 可直接发给后端的 run config。
 *
 * 本地缓存解析工具（当前 Chat 重试已不使用它）；它不回落到第一个 provider。
 * 缺少有效缓存返回 null，调用方必须读取服务端当前选择或明确拒绝，不能恢复来源任务配置。
 */
export function storedRunConfigRequest(storageKey, providerOptions) {
  const stored = safeReadRunConfigSelection(storageKey);
  if (!stored?.providerId || !stored.modelId) return null;
  const provider = (providerOptions || []).find((item) => item.id === stored.providerId);
  const request = String(provider?.requestProvider || provider?.provider || '').trim();
  if (!request) return null;
  return {
    provider: request,
    modelId: stored.modelId,
    reasoningEffort: normalizeReasoningEffort(stored.reasoningEffort, provider.defaultReasoningEffort),
  };
}

export function usePersistentRunConfig({ selectionStorageKey, providerOptions, agentOptions, defaultAgentId }) {
  const [selection, setSelection] = React.useState(() => resolveRunConfigSelection(
    selectionStorageKey,
    providerOptions,
    agentOptions,
    defaultAgentId,
  ));
  const storageKeyRef = React.useRef(selectionStorageKey || '');
  // Prefer writing the owner-level selection only on intentional picker changes,
  // not when switching conversations reloads a different conversation-local selection.
  const preferWriteRef = React.useRef(false);

  React.useEffect(() => {
    const nextKey = selectionStorageKey || '';
    const keyChanged = storageKeyRef.current !== nextKey;
    const nextSelection = resolveRunConfigSelection(
      selectionStorageKey,
      providerOptions,
      agentOptions,
      defaultAgentId,
    );
    setSelection((current) => {
      if (!keyChanged && current.serverKey === nextKey) {
        if (!Object.hasOwn(current, 'pendingReasoningEffort')) return current;
        const provider = (providerOptions || []).find((item) => item.id === current.providerId || (item.requestProvider || item.provider) === current.providerId);
        if (!provider) return current;
        const { pendingReasoningEffort, ...rest } = current;
        return { ...rest, providerId: provider.id, providerDefaultModelId: provider.defaultModelId || '',
          reasoningEffort: normalizeReasoningEffort(pendingReasoningEffort, provider.defaultReasoningEffort) };
      }
      const providerId = keyChanged || !optionHasId(providerOptions, current.providerId)
        ? nextSelection.providerId
        : current.providerId;
      const provider = (providerOptions || []).find((item) => item.id === providerId);
      const providerDefaultModelId = String(provider?.defaultModelId || '').trim();
      const defaultModelChanged = providerDefaultModelId !== current.providerDefaultModelId;
      const modelId = keyChanged || providerId !== current.providerId || defaultModelChanged
        ? nextSelection.modelId
        : current.modelId;
      const agentId = keyChanged || !optionHasId(agentOptions, current.agentId)
        ? nextSelection.agentId
        : current.agentId;
      const reasoningEffort = keyChanged || (defaultModelChanged && !current.providerDefaultModelId) || !REASONING_EFFORT_OPTIONS.some((item) => item.id === current.reasoningEffort)
        ? nextSelection.reasoningEffort
        : current.reasoningEffort;
      if (providerId === current.providerId && modelId === current.modelId && providerDefaultModelId === current.providerDefaultModelId && agentId === current.agentId && reasoningEffort === current.reasoningEffort) {
        return current;
      }
      return { providerId, modelId, providerDefaultModelId, agentId, reasoningEffort, serverKey: undefined };
    });
    storageKeyRef.current = nextKey;
  }, [selectionStorageKey, providerOptions, agentOptions, defaultAgentId]);

  React.useEffect(() => {
    if (
      optionHasId(providerOptions, selection.providerId)
      && Boolean(selection.modelId)
      && optionHasId(agentOptions, selection.agentId)
      && REASONING_EFFORT_OPTIONS.some((item) => item.id === selection.reasoningEffort)
    ) {
      safeWriteRunConfigSelection(selectionStorageKey, selection);
      if (preferWriteRef.current) {
        preferWriteRef.current = false;
        const preferredKey = preferredStorageKeyFromSelectionKey(selectionStorageKey);
        if (preferredKey) safeWriteRunConfigSelection(preferredKey, selection);
      }
    }
  }, [selectionStorageKey, selection, providerOptions, agentOptions]);

  const markPreferredWrite = React.useCallback(() => {
    preferWriteRef.current = true;
  }, []);

  return {
    restoreConfig: (config) => {
      const provider = providerOptions.find((item) => (item.requestProvider || item.provider) === config.provider);
      setSelection((current) => {
        const { pendingReasoningEffort: _pending, ...rest } = current;
        return { ...rest, serverKey: selectionStorageKey || '', providerId: provider?.id || config.provider || '', modelId: config.model_id || '', providerDefaultModelId: provider?.defaultModelId || '',
          reasoningEffort: normalizeReasoningEffort(config.reasoning_effort, provider?.defaultReasoningEffort),
          ...(!provider ? { pendingReasoningEffort: config.reasoning_effort } : {}),
          agentId: config.workflow_id || config.agent_id || current.agentId };
      });
    },
    serverSelection: selection.serverKey === (selectionStorageKey || ''),
    providerId: selection.providerId,
    modelId: selection.modelId,
    agentId: selection.agentId,
    reasoningEffort: selection.reasoningEffort,
    setProviderId: React.useCallback((providerId) => {
      markPreferredWrite();
      setSelection((current) => {
        const provider = (providerOptions || []).find((item) => item.id === providerId);
        const providerDefaultModelId = String(provider?.defaultModelId || '').trim();
        // Apply the selected Settings row atomically; never inherit the previous provider's effort.
        const reasoningEffort = normalizeReasoningEffort(provider?.defaultReasoningEffort);
        const { pendingReasoningEffort: _pending, ...rest } = current;
        return provider ? { ...rest, providerId: provider.id, modelId: providerDefaultModelId, providerDefaultModelId, reasoningEffort } : current;
      });
    }, [providerOptions, markPreferredWrite]),
    setModelId: React.useCallback((modelId) => {
      markPreferredWrite();
      setSelection((current) => ({ ...current, modelId }));
    }, [markPreferredWrite]),
    setAgentId: React.useCallback((agentId) => {
      markPreferredWrite();
      setSelection((current) => ({ ...current, agentId }));
    }, [markPreferredWrite]),
    setReasoningEffort: React.useCallback((reasoningEffort) => {
      markPreferredWrite();
      setSelection((current) => {
        const provider = providerOptions.find((item) => item.id === current.providerId);
        const { pendingReasoningEffort: _pending, ...rest } = current;
        return { ...rest, reasoningEffort: normalizeReasoningEffort(reasoningEffort, provider?.defaultReasoningEffort) };
      });
    }, [providerOptions, markPreferredWrite]),
  };
}
