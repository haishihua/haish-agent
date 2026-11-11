// Provider 模型目录：chat 的模型选择器和 workflow 的运行配置读同一份加载逻辑。
// 缓存按「请求是否真的相同」分键，切换 provider 不会串到上一家的列表。
import React from 'react';
import { API_BASE } from '../api/base.js';
import { apiFetch, parseResponseMessage } from '../api/client.js';

const PROVIDER_MODELS_STORAGE_KEY = 'haish_provider_models_v1';
export const PROVIDER_MODELS_TIMEOUT_MS = 15_000;

function providerModelsRequest(providerOption) {
  if (!providerOption?.provider) return null;
  return {
    llm_config_id: providerOption.id,
    provider: providerOption.provider,
    auth_mode: providerOption.authMode || '',
    custom_provider: providerOption.customProvider || '',
    base_url: providerOption.baseUrl || '',
    ...(providerOption.provider === 'custom' ? { protocol: providerOption.protocol || 'openai' } : {}),
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
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const cache = JSON.parse(window.localStorage.getItem(PROVIDER_MODELS_STORAGE_KEY) || '{}');
    const catalog = cache?.[requestKey];
    if (!catalog) return null;
    return normalizeProviderModels({ models: catalog.options, default_model: catalog.defaultModelId });
  } catch (_) {
    return null;
  }
}

function writeProviderModelsCache(requestKey, catalog) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const cache = JSON.parse(window.localStorage.getItem(PROVIDER_MODELS_STORAGE_KEY) || '{}');
    cache[requestKey] = catalog;
    window.localStorage.setItem(PROVIDER_MODELS_STORAGE_KEY, JSON.stringify(cache));
  } catch (_) {
    // The live catalog remains usable when storage is unavailable.
  }
}

export function useProviderModels(providerOption) {
  const requestKey = JSON.stringify(providerModelsRequest(providerOption));
  const fallback = normalizeProviderModels({
    models: [...(providerOption?.modelOptions || []), ...(providerOption?.defaultModelId ? [providerOption.defaultModelId] : [])],
    default_model: providerOption?.defaultModelId || '',
  });
  const [retryCount, setRetryCount] = React.useState(0);
  const retry = React.useCallback(() => setRetryCount(count => count + 1), []);
  const [state, setState] = React.useState({ requestKey: '', options: [], defaultModelId: '', refreshing: false, error: '' });

  React.useEffect(() => {
    const request = JSON.parse(requestKey);
    if (!request?.llm_config_id) return undefined;
    const cached = readProviderModelsCache(requestKey);
    const controller = new AbortController();
    let finished = false;
    setState(previous => ({
      ...(previous.requestKey === requestKey ? previous : { ...cached, error: '' }),
      requestKey, refreshing: true,
    }));
    // Own the whole request, including response.json(). Abort alone is not a
    // deadline: the desktop transport may settle late or ignore cancellation.
    const finish = (catalog, error = '') => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      if (catalog?.options.length) writeProviderModelsCache(requestKey, catalog);
      setState(previous => ({ ...previous, ...(catalog?.options.length ? catalog : {}), refreshing: false, error }));
    };
    const timer = window.setTimeout(() => {
      finish(null, 'Loading models timed out. Retry to refresh the model list.');
      controller.abort();
    }, PROVIDER_MODELS_TIMEOUT_MS);
    void (async () => {
      try {
        const response = await apiFetch(`${API_BASE}/api/llm/models`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: requestKey, signal: controller.signal,
        }, { json: false });
        if (finished) return;
        if (!response.ok) throw new Error(await parseResponseMessage(response, `Model list could not be loaded (${response.status}).`));
        const payload = await response.json();
        if (finished) return;
        const responseProvider = String(payload?.provider || '').trim();
        if (responseProvider && responseProvider !== request.provider) throw new Error('The model list belongs to a different provider. Retry to refresh it.');
        if (!Array.isArray(payload?.models)) throw new Error('Invalid model list response. Retry to refresh it.');
        finish(normalizeProviderModels(payload));
      } catch (error) {
        // Only our disposed/timed-out request is ignored. An unexpected active
        // AbortError must settle the UI just like any other network failure.
        finish(null, error?.name === 'AbortError' ? 'Model loading was interrupted. Retry to refresh the model list.'
          : (error?.message || 'Model list could not be loaded. Please retry.'));
      }
    })();
    return () => {
      finished = true;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [requestKey, retryCount]);

  const matches = state.requestKey === requestKey;
  const catalog = matches ? state : readProviderModelsCache(requestKey);
  const available = normalizeProviderModels({
    models: [...(catalog?.options || []), ...fallback.options],
    default_model: fallback.defaultModelId || catalog?.defaultModelId || '',
  });
  const refreshing = Boolean(providerOption?.id && providerOption?.provider && (matches ? state.refreshing : true));
  return {
    ...available, loading: refreshing && available.options.length === 0, refreshing,
    error: matches ? state.error : '', retry,
  };
}
