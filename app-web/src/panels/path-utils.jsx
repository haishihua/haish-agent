// @haish-esm
import React from 'react';
import { API_BASE } from '../api/base.js';
import { authFetch } from '../api/auth.js';
import { DEFAULT_REASONING_EFFORT, REASONING_EFFORT_OPTIONS } from './shared-constants.jsx';

const PROVIDER_MODELS_STORAGE_KEY = 'haish_provider_models_v1';

export function isAbsolutePathLike(value) {
  return value.startsWith('/') || value === '~' || value.startsWith('~/') || /^[A-Za-z]:[\\/]/.test(value);
}

export function normalizeFsPath(value, homePath = '') {
  const raw = String(value || '').trim().replace(/\\/g, '/');
  const normalizedHome = String(homePath || '').trim().replace(/\\/g, '/').replace(/\/+$/, '');
  const expanded = normalizedHome && (raw === '~' || raw.startsWith('~/'))
    ? `${normalizedHome}${raw.slice(1)}`
    : raw;
  return expanded.replace(/\/+$/, '');
}

export function basenameFromPath(value) {
  const normalized = normalizeFsPath(value);
  if (!normalized) return '';
  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] || normalized;
}

export function workspaceRelativePath(filePath, workspacePath, homePath = '') {
  const normalizedFile = normalizeFsPath(filePath, homePath);
  if (!normalizedFile) return '';
  const normalizedWorkspace = normalizeFsPath(workspacePath || homePath, homePath);
  if (!normalizedWorkspace) return normalizedFile;
  if (normalizedFile === normalizedWorkspace) return basenameFromPath(normalizedFile);
  const prefix = `${normalizedWorkspace}/`;
  if (normalizedFile.startsWith(prefix)) return normalizedFile.slice(prefix.length);
  return normalizedFile;
}

export function stripWorkspaceNamePrefix(relativePath, workspacePath, homePath = '') {
  const normalized = normalizeFsPath(relativePath, homePath).replace(/^\.\/+/, '');
  if (!normalized) return '';
  const workspaceName = basenameFromPath(workspacePath || homePath);
  if (!workspaceName || !normalized.includes('/')) return normalized;
  const parts = normalized.split('/').filter(Boolean);
  if (parts[0] === workspaceName && parts.length > 1) return parts.slice(1).join('/');
  return normalized;
}

export function normalizePastedPathLine(line, workspacePath, options = {}) {
  const homePath = options.homePath || '';
  let text = String(line || '').trim();
  if (!text) return '';
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim();
  }
  if (text.startsWith('file://')) {
    try {
      text = decodeURIComponent(text.replace(/^file:\/\//, ''));
    } catch (error) {
      text = text.replace(/^file:\/\//, '');
    }
  }
  if (isAbsolutePathLike(text)) return workspaceRelativePath(text, workspacePath, homePath);
  const relativePath = stripWorkspaceNamePrefix(text, workspacePath, homePath);
  return options.filePaste && !normalizeFsPath(workspacePath || homePath, homePath) ? basenameFromPath(relativePath) : relativePath;
}

export function normalizePastedPathText(text, workspacePath, homePath = '') {
  const raw = String(text || '');
  const lines = raw.split(/\r?\n/);
  const shouldNormalize = lines.every((line) => {
    const item = line.trim();
    return !item
      || item.startsWith('file://')
      || isAbsolutePathLike(item)
      || item.startsWith('./')
      || item.startsWith('../')
      || (item.includes('/') && !/\s/.test(item));
  });
  if (!shouldNormalize) return '';
  const normalized = lines.map((line) => normalizePastedPathLine(line, workspacePath, { homePath })).join('\n');
  return normalized === raw ? '' : normalized;
}

export function clipboardFilesToPathText(files, workspacePath, homePath = '') {
  return Array.from(files || [])
    .map((file) => {
      const nativePath = (() => {
        try {
          return window.haish?.getPathForFile?.(file) || '';
        } catch (_) {
          return '';
        }
      })();
      const rawPath = nativePath || file?.path || file?.webkitRelativePath || '';
      return normalizePastedPathLine(rawPath, workspacePath, { filePaste: true, homePath });
    })
    .filter(Boolean)
    .join('\n');
}

export function clipboardUriListToPathText(uriList, workspacePath, homePath = '') {
  return String(uriList || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => normalizePastedPathLine(line, workspacePath, { filePaste: true, homePath }))
    .filter(Boolean)
    .join('\n');
}

export function insertTextAtSelection(value, insertText, selectionStart, selectionEnd, maxLength) {
  const current = String(value || '');
  const start = Number.isFinite(selectionStart) ? selectionStart : current.length;
  const end = Number.isFinite(selectionEnd) ? selectionEnd : start;
  const prefix = current.slice(0, start);
  const suffix = current.slice(end);
  const spacerBefore = prefix && !/[\s\n]$/.test(prefix) ? '\n' : '';
  const spacerAfter = suffix && !/^[\s\n]/.test(suffix) ? '\n' : '';
  return `${prefix}${spacerBefore}${insertText}${spacerAfter}${suffix}`.slice(0, maxLength);
}

export function handlePathPaste(event, currentValue, setValue, workspacePath, homePath = '', maxLength = 500) {
  const clipboard = event.clipboardData;
  if (!clipboard) return;
  const uriText = clipboardUriListToPathText(clipboard.getData('text/uri-list'), workspacePath, homePath);
  const fileText = clipboardFilesToPathText(clipboard.files, workspacePath, homePath);
  const plainText = clipboard.getData('text/plain');
  const normalizedText = uriText || fileText || normalizePastedPathText(plainText, workspacePath, homePath);
  if (!normalizedText) return;
  event.preventDefault();
  const target = event.currentTarget;
  const selectionStart = target.selectionStart;
  const nextValue = insertTextAtSelection(
    currentValue,
    normalizedText,
    selectionStart,
    target.selectionEnd,
    maxLength,
  );
  setValue(nextValue);
  window.requestAnimationFrame(() => {
    const cursor = Math.min(nextValue.length, (selectionStart || 0) + normalizedText.length);
    target.setSelectionRange(cursor, cursor);
  });
}

export function formatContextTokens(value) {
  const tokens = Math.max(0, Math.round(Number(value) || 0));
  const thousands = tokens / 1000;
  if (tokens === 0) return '0k';
  if (thousands < 10) return `${Math.max(0.1, thousands).toFixed(1).replace(/\.0$/, '')}k`;
  return `${Math.round(thousands)}k`;
}

export function formatContextUsageLabel(usedTokens, totalTokens) {
  return `Context: ${formatContextTokens(usedTokens)} / ${formatContextTokens(totalTokens)}`;
}

export function formatElapsedDuration(start, end) {
  const startMs = Number(start) || 0;
  const endMs = Number(end) || 0;
  if (!startMs || !endMs || endMs < startMs) return '';
  const totalSeconds = Math.max(0, Math.floor((endMs - startMs) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

export function formatMessageClock(value) {
  const time = Number(value) || 0;
  if (!time) return '';
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export async function copyTextToClipboard(text) {
  const value = String(text || '');
  if (!value.trim()) return false;
  try {
    const clipboard = globalThis.navigator?.clipboard;
    if (clipboard?.writeText) {
      await clipboard.writeText(value);
      return true;
    }
  } catch (error) {
    // Fall through to the textarea copy path below.
  }
  try {
    const el = document.createElement('textarea');
    el.value = value;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.left = '-9999px';
    el.style.top = '0';
    document.body.appendChild(el);
    el.focus();
    el.select();
    el.setSelectionRange(0, value.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch (error) {
    return false;
  }
}

export function safeReadRunConfigSelection(storageKey) {
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
      reasoningEffort: typeof parsed.reasoningEffort === 'string' ? parsed.reasoningEffort : '',
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

export function optionHasId(options, id) {
  return Array.isArray(options) && options.some((item) => item?.id === id);
}

export function firstRunProvider(providerOptions) {
  if (!Array.isArray(providerOptions) || providerOptions.length === 0) return null;
  // Prefer xAI for brand-new conversation selections when available.
  const xai = providerOptions.find((item) => {
    const provider = String(item?.provider || '').trim().toLowerCase();
    const id = String(item?.id || '').trim().toLowerCase();
    return provider === 'xai' || provider === 'grok' || id === 'xai' || id.includes(':xai') || id.startsWith('xai');
  });
  return xai || providerOptions[0];
}

export function providerModelsRequest(providerOption) {
  if (!providerOption?.provider) return null;
  return {
    provider: providerOption.provider,
    auth_mode: providerOption.authMode || '',
    custom_provider: providerOption.customProvider || '',
    base_url: providerOption.baseUrl || '',
    model: providerOption.defaultModelId || '',
    refresh: true,
  };
}

export function normalizeProviderModels(payload) {
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
    authFetch(`${API_BASE}/api/llm/models`, {
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
  const storedReasoning = REASONING_EFFORT_OPTIONS.some((item) => item.id === stored?.reasoningEffort)
    ? stored.reasoningEffort
    : '';
  const fallbackProvider = firstRunProvider(providerOptions);
  const storedProviderIsValid = optionHasId(providerOptions, stored?.providerId);
  const providerId = storedProviderIsValid ? stored.providerId : (fallbackProvider?.id || '');
  const provider = (providerOptions || []).find((item) => item.id === providerId) || fallbackProvider;
  const providerDefaultModelId = String(provider?.defaultModelId || '').trim();
  const storedDefaultIsCurrent = stored?.providerDefaultModelId === providerDefaultModelId;
  return {
    providerId,
    modelId: storedProviderIsValid && storedDefaultIsCurrent
      ? stored?.modelId || providerDefaultModelId
      : providerDefaultModelId,
    providerDefaultModelId,
    agentId: optionHasId(agentOptions, stored?.agentId) ? stored.agentId : defaultAgentId,
    reasoningEffort: storedReasoning || DEFAULT_REASONING_EFFORT,
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
      const reasoningEffort = keyChanged || !REASONING_EFFORT_OPTIONS.some((item) => item.id === current.reasoningEffort)
        ? nextSelection.reasoningEffort
        : current.reasoningEffort;
      if (providerId === current.providerId && modelId === current.modelId && providerDefaultModelId === current.providerDefaultModelId && agentId === current.agentId && reasoningEffort === current.reasoningEffort) {
        return current;
      }
      return { providerId, modelId, providerDefaultModelId, agentId, reasoningEffort };
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
    }
  }, [selectionStorageKey, selection, providerOptions, agentOptions]);

  return {
    providerId: selection.providerId,
    modelId: selection.modelId,
    agentId: selection.agentId,
    reasoningEffort: selection.reasoningEffort,
    setProviderId: React.useCallback((providerId) => setSelection((current) => {
      const provider = (providerOptions || []).find((item) => item.id === providerId);
      const providerDefaultModelId = String(provider?.defaultModelId || '').trim();
      return provider ? { ...current, providerId: provider.id, modelId: providerDefaultModelId, providerDefaultModelId } : current;
    }), [providerOptions]),
    setModelId: React.useCallback((modelId) => setSelection((current) => ({ ...current, modelId })), []),
    setAgentId: React.useCallback((agentId) => setSelection((current) => ({ ...current, agentId })), []),
    setReasoningEffort: React.useCallback((reasoningEffort) => setSelection((current) => ({ ...current, reasoningEffort })), []),
  };
}
