// @haish-esm
import React from 'react';
import { DEFAULT_REASONING_EFFORT, REASONING_EFFORT_OPTIONS } from './shared-constants.jsx';

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
  if (Array.isArray(providerOptions) && providerOptions.length > 0) return providerOptions[0];
  return null;
}

export function modelsForRunProvider(providerOption, fallbackOptions) {
  if (!providerOption) return Array.isArray(fallbackOptions) ? fallbackOptions : [];
  if (Array.isArray(providerOption.modelOptions)) {
    if (providerOption.modelOptions.length > 0) return providerOption.modelOptions;
    const fallbackModelId = String(providerOption.defaultModelId || '').trim();
    return fallbackModelId ? [{ id: fallbackModelId, label: fallbackModelId }] : [];
  }
  const options = fallbackOptions;
  return Array.isArray(options) && options.length > 0 ? options : [];
}

export function resolveRunConfigSelection(storageKey, providerOptions, modelOptions, defaultModelId, agentOptions, defaultAgentId) {
  const stored = safeReadRunConfigSelection(storageKey);
  const storedReasoning = REASONING_EFFORT_OPTIONS.some((item) => item.id === stored?.reasoningEffort)
    ? stored.reasoningEffort
    : '';
  const fallbackProvider = firstRunProvider(providerOptions);
  const providerId = optionHasId(providerOptions, stored?.providerId) ? stored.providerId : (fallbackProvider?.id || '');
  const provider = (providerOptions || []).find((item) => item.id === providerId) || fallbackProvider;
  const activeModelOptions = modelsForRunProvider(provider, modelOptions);
  const activeDefaultModelId = provider ? (provider.defaultModelId || defaultModelId || activeModelOptions[0]?.id || '') : '';
  return {
    providerId,
    modelId: optionHasId(activeModelOptions, stored?.modelId) ? stored.modelId : activeDefaultModelId,
    agentId: optionHasId(agentOptions, stored?.agentId) ? stored.agentId : defaultAgentId,
    reasoningEffort: storedReasoning || DEFAULT_REASONING_EFFORT,
  };
}

export function usePersistentRunConfig({ selectionStorageKey, providerOptions, modelOptions, defaultModelId, agentOptions, defaultAgentId }) {
  const [selection, setSelection] = React.useState(() => resolveRunConfigSelection(
    selectionStorageKey,
    providerOptions,
    modelOptions,
    defaultModelId,
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
      modelOptions,
      defaultModelId,
      agentOptions,
      defaultAgentId,
    );
    setSelection((current) => {
      const providerId = keyChanged || !optionHasId(providerOptions, current.providerId)
        ? nextSelection.providerId
        : current.providerId;
      const provider = (providerOptions || []).find((item) => item.id === providerId)
        || firstRunProvider(providerOptions);
      const activeModelOptions = modelsForRunProvider(provider, modelOptions);
      const modelId = keyChanged || providerId !== current.providerId || !optionHasId(activeModelOptions, current.modelId)
        ? nextSelection.modelId
        : current.modelId;
      const agentId = keyChanged || !optionHasId(agentOptions, current.agentId)
        ? nextSelection.agentId
        : current.agentId;
      const reasoningEffort = keyChanged || !REASONING_EFFORT_OPTIONS.some((item) => item.id === current.reasoningEffort)
        ? nextSelection.reasoningEffort
        : current.reasoningEffort;
      if (providerId === current.providerId && modelId === current.modelId && agentId === current.agentId && reasoningEffort === current.reasoningEffort) {
        return current;
      }
      return { providerId, modelId, agentId, reasoningEffort };
    });
    storageKeyRef.current = nextKey;
  }, [selectionStorageKey, providerOptions, modelOptions, defaultModelId, agentOptions, defaultAgentId]);

  React.useEffect(() => {
    const provider = (providerOptions || []).find((item) => item.id === selection.providerId)
      || firstRunProvider(providerOptions);
    const activeModelOptions = modelsForRunProvider(provider, modelOptions);
    if (
      optionHasId(providerOptions, selection.providerId)
      && optionHasId(activeModelOptions, selection.modelId)
      && optionHasId(agentOptions, selection.agentId)
      && REASONING_EFFORT_OPTIONS.some((item) => item.id === selection.reasoningEffort)
    ) {
      safeWriteRunConfigSelection(selectionStorageKey, selection);
    }
  }, [selectionStorageKey, selection.providerId, selection.modelId, selection.agentId, selection.reasoningEffort, providerOptions, modelOptions, defaultModelId, agentOptions]);

  return {
    providerId: selection.providerId,
    modelId: selection.modelId,
    agentId: selection.agentId,
    reasoningEffort: selection.reasoningEffort,
    setProviderId: React.useCallback((providerId) => setSelection((current) => {
      const provider = (providerOptions || []).find((item) => item.id === providerId)
        || firstRunProvider(providerOptions);
      if (!provider) return { ...current, providerId: '', modelId: '' };
      const nextModelOptions = modelsForRunProvider(provider, modelOptions);
      const modelId = optionHasId(nextModelOptions, current.modelId)
        ? current.modelId
        : (provider.defaultModelId || nextModelOptions[0]?.id || current.modelId);
      return { ...current, providerId: provider.id, modelId };
    }), [providerOptions, modelOptions, defaultModelId]),
    setModelId: React.useCallback((modelId) => setSelection((current) => ({ ...current, modelId })), []),
    setAgentId: React.useCallback((agentId) => setSelection((current) => ({ ...current, agentId })), []),
    setReasoningEffort: React.useCallback((reasoningEffort) => setSelection((current) => ({ ...current, reasoningEffort })), []),
  };
}

