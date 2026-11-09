import React from 'react';
import { REASONING_EFFORT_OPTIONS, normalizeReasoningEffort } from '../../../core/run-catalog.js';
import { migrateExecutionRoute, savedExecutionConfigId } from '../../../core/execution-identity.js';

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
  if (!storageKey || typeof window === 'undefined' || !window.localStorage || selection.legacyProvider) return;
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

export function resolveRunConfigSelection(storageKey, providerOptions, agentOptions, defaultAgentId) {
  const stored = safeReadRunConfigSelection(storageKey);
  const preferredKey = preferredStorageKeyFromSelectionKey(storageKey);
  const preferred = preferredKey ? safeReadRunConfigSelection(preferredKey) : null;
  // Conversation-local config wins; otherwise fall back to the user's last pick
  // so a new chat keeps the previously selected agent (e.g. Simple Agent).
  const agentSource = optionHasId(agentOptions, stored?.agentId)
    ? stored
    : (optionHasId(agentOptions, preferred?.agentId) ? preferred : null);
  const providerSource = stored || (savedExecutionConfigId(preferred?.providerId, providerOptions, true) ? preferred : null);
  const providerId = savedExecutionConfigId(providerSource?.providerId, providerOptions, true) || providerSource?.providerId || '';
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
        if (current.legacyProvider || !Object.hasOwn(current, 'pendingReasoningEffort')) return current;
        const configId = savedExecutionConfigId(current.providerId, providerOptions, current.pendingLegacyIdentity === true);
        const provider = (providerOptions || []).find((item) => item.id === configId);
        if (!provider) return current;
        const { pendingReasoningEffort, pendingLegacyIdentity: _legacy, ...rest } = current;
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
      !selection.legacyProvider
      && optionHasId(providerOptions, selection.providerId)
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
      config = migrateExecutionRoute(config, providerOptions);
      const provider = providerOptions.find((item) => item.id === (config.llm_config_id || config.provider));
      setSelection((current) => {
        const { pendingReasoningEffort: _pending, pendingLegacyIdentity: _legacy, legacyProvider: _provider, ...rest } = current;
        return { ...rest, legacyProvider: config.llm_config_id ? (config.provider || '') : '', serverKey: selectionStorageKey || '', providerId: provider?.id || config.llm_config_id || config.provider || '', modelId: config.model_id || '', providerDefaultModelId: provider?.defaultModelId || '',
          reasoningEffort: normalizeReasoningEffort(config.reasoning_effort, provider?.defaultReasoningEffort),
          ...(!provider ? { pendingReasoningEffort: config.reasoning_effort, pendingLegacyIdentity: !config.llm_config_id } : {}),
          agentId: config.workflow_id || config.agent_id || current.agentId };
      });
    },
    serverSelection: selection.serverKey === (selectionStorageKey || ''),
    providerId: selection.providerId,
    legacyProvider: selection.legacyProvider || '',
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
        const { pendingReasoningEffort: _pending, pendingLegacyIdentity: _legacy, legacyProvider: _provider, ...rest } = current;
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
