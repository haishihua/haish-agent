// @haish-esm
import React from 'react';
import {
  DEFAULT_AGENT_OPTIONS } from './shared-constants.jsx';

import { PortalTooltip } from './PortalTooltip.jsx';
import { ModelPicker,
  ApprovalModePicker } from './ModelPickers.jsx';
import { AttachmentFileChip } from './Format.jsx';
import {
  handlePathPaste,
  formatContextUsageLabel,
  usePersistentRunConfig,
  useProviderModels,
} from './path-utils.jsx';

export function TaskDelegation({ onDeploy, onStop, onSelectFile, onClearFile, onSelectionChange, attachment, uploading, running, disabled, submitPending = false, contextUsage, workspacePath, homePath, activeTaskText, providerOptions = [], agentOptions, defaultAgentId, agentLoading = false, agentLocked = false, agentLockedReason = '', lockedAgentId = '', selectionStorageKey = '' }) {
  const resolvedProviderOptions = Array.isArray(providerOptions) && providerOptions.length > 0
    ? providerOptions
    : [];
  const resolvedAgentOptions = Array.isArray(agentOptions) && agentOptions.length > 0 ? agentOptions : DEFAULT_AGENT_OPTIONS;
  const resolvedDefaultAgentId = defaultAgentId || resolvedAgentOptions[0]?.id || DEFAULT_AGENT_OPTIONS[0].id;
  const [v, setV] = React.useState('');
  const { providerId, setProviderId, modelId, setModelId, agentId, setAgentId, reasoningEffort, setReasoningEffort } = usePersistentRunConfig({
    selectionStorageKey,
    providerOptions: resolvedProviderOptions,
    agentOptions: resolvedAgentOptions,
    defaultAgentId: resolvedDefaultAgentId,
  });
  const taRef = React.useRef(null);
  const fileRef = React.useRef(null);
  const suppressSubmitUntilRef = React.useRef(0);
  const usedTokens = Math.max(0, Math.round(Number(contextUsage?.usedTokens) || 0));
  const totalTokens = Math.max(1, Math.round(Number(contextUsage?.totalTokens) || 128000));
  const contextRatio = Math.max(0, Math.min(1, Number(contextUsage?.ratio) || (usedTokens / totalTokens)));
  const visibleContextRatio = usedTokens > 0 ? Math.max(contextRatio, 0.01) : 0;
  const contextTooltip = `${formatContextUsageLabel(usedTokens, totalTokens)}${contextUsage?.overLimit ? ' · Over limit' : ''}`;
  const contextRingStyle = {
    '--context-used': `${visibleContextRatio * 100}%`,
  };
  const runConfigReadOnly = running || submitPending;
  const runConfigDisabled = !runConfigReadOnly && (disabled || submitPending);
  const effectiveAgentId = agentLocked && lockedAgentId ? lockedAgentId : agentId;
  const currentSelection = resolvedAgentOptions.find((item) => item.id === effectiveAgentId);
  const canUploadDocuments = currentSelection?.canUploadDocuments === true;
  const currentProvider = resolvedProviderOptions.find((item) => item.id === providerId) || resolvedProviderOptions[0];
  const providerModels = useProviderModels(currentProvider);
  const activeModelOptions = providerModels.options;
  const modelLoading = providerModels.loading;
  const providerRequest = currentProvider?.requestProvider || currentProvider?.provider || providerId || '';
  const providerConfigured = Boolean(currentProvider && providerRequest);

  React.useEffect(() => {
    if (modelLoading) return;
    const nextModelId = activeModelOptions.some((item) => item.id === modelId)
      ? modelId
      : providerModels.defaultModelId;
    if (nextModelId !== modelId) setModelId(nextModelId);
  }, [activeModelOptions, modelId, modelLoading, providerModels.defaultModelId, setModelId]);

  React.useEffect(() => {
    onSelectionChange?.(effectiveAgentId);
  }, [effectiveAgentId, onSelectionChange]);

  React.useLayoutEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 132) + 'px';
  }, [v]);

  function restoreActiveTaskText() {
    const text = String(activeTaskText || '').trim();
    if (!text) return;
    setV(text);
    requestAnimationFrame(() => {
      taRef.current?.focus?.();
      taRef.current?.setSelectionRange?.(text.length, text.length);
    });
  }

  function stopAndRestore() {
    onStop?.();
    restoreActiveTaskText();
  }

  function handleStopPress(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    suppressSubmitUntilRef.current = Date.now() + 700;
    stopAndRestore();
  }

  function handleStopKey(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    handleStopPress(event);
  }

  React.useEffect(() => {
    if (!running && !submitPending) return undefined;
    function handleEscape(event) {
      if (event.key !== 'Escape' || event.isComposing) return;
      event.preventDefault();
      stopAndRestore();
    }
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [running, submitPending, activeTaskText, onStop]);

  function submit(e) {
    e?.preventDefault();
    if (Date.now() < suppressSubmitUntilRef.current) return;
    if (!v.trim() || disabled || submitPending || !providerConfigured) return;
    if (modelLoading || !activeModelOptions.some((o) => o.id === modelId)) return;
    if (!resolvedAgentOptions.some((o) => o.id === effectiveAgentId)) return;
    onDeploy(v.trim(), attachment, modelId, reasoningEffort, [], effectiveAgentId, providerRequest);
    setV('');
    onClearFile?.();
    if (fileRef.current) fileRef.current.value = '';
  }

  function pickFile() {
    if (!canUploadDocuments || disabled || submitPending) return;
    fileRef.current?.click();
  }

  React.useEffect(() => {
    if (!canUploadDocuments && attachment) onClearFile?.();
  }, [canUploadDocuments, attachment, onClearFile]);

  function clearFile(e) {
    e.stopPropagation();
    onClearFile?.();
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div className="task-delegation">
      <div className="td-head">
        <div className="td-title">
          <span className="td-glyph ico ico-task-delegation" aria-hidden="true" />
          Task Delegation
        </div>
      </div>
      {attachment && (
        <div className="td-attachments" aria-label="Attached files">
          <AttachmentFileChip attachment={attachment} uploading={uploading} onClear={clearFile} />
        </div>
      )}
      <div className="td-input-row">
        <textarea
          ref={taRef}
          rows={1}
          value={v}
          onChange={e => setV(e.target.value)}
          onPaste={e => handlePathPaste(e, v, setV, workspacePath, homePath, 5000)}
          onKeyDown={e => {
            if (e.key === 'Escape' && running && !e.nativeEvent.isComposing) {
              e.preventDefault();
              e.stopPropagation();
              stopAndRestore();
              return;
            }
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
          }}
          placeholder={!providerConfigured ? 'Configure an LLM provider in Settings first...' : submitPending ? 'Preparing conversation...' : uploading ? 'Document is processing. Please wait...' : disabled ? 'Agents are currently busy executing...' : 'Describe the task you want to delegate...'}
          disabled={disabled}
          maxLength={5000}
        />
        <div className="char-count">{v.length} / 5000</div>
      </div>
      <div className="td-actions">
        <div className="td-tools">
          {canUploadDocuments ? (
            <>
              <PortalTooltip text="Attach File" position="above">
                <button
                  type="button"
                  className="td-btn td-btn-attach icon-only"
                  onClick={pickFile}
                  disabled={disabled || submitPending}
                  aria-label="Attach File"
                >
                  <span className="ico ico-attach" aria-hidden="true" />
                </button>
              </PortalTooltip>
              <input
                ref={fileRef}
                type="file"
                className="td-file-input"
                onChange={e => {
                  const nextFile = e.target.files?.[0] || null;
                  if (!nextFile) return;
                  onSelectFile?.(nextFile, effectiveAgentId);
                }}
              />
            </>
          ) : null}
          <ApprovalModePicker readOnly={runConfigReadOnly} disabled={runConfigDisabled} />
        </div>
        <div className="td-submit-cluster">
          <PortalTooltip text={contextTooltip} position="above">
            <button
              type="button"
              className={`context-usage-btn icon-only ${contextUsage?.compressed ? 'compressed' : ''} ${contextUsage?.overLimit ? 'over-limit' : ''}`}
              aria-label={contextTooltip}
              aria-disabled="true"
            >
              <span className="context-usage-icon" style={contextRingStyle} aria-hidden="true" />
            </button>
          </PortalTooltip>
          <ModelPicker
            value={modelId}
            reasoningEffort={reasoningEffort}
            options={activeModelOptions}
            onChange={setModelId}
            onReasoningChange={setReasoningEffort}
            disabled={runConfigDisabled}
            readOnly={runConfigReadOnly}
            loading={modelLoading}
            providerValue={providerId}
            providerOptions={resolvedProviderOptions}
            onProviderChange={setProviderId}
            agentValue={effectiveAgentId}
            agentOptions={resolvedAgentOptions}
            onAgentChange={setAgentId}
            agentLoading={agentLoading}
            agentLocked={agentLocked}
            agentLockedReason={agentLockedReason}
          />
          {submitPending || running ? (
            <PortalTooltip text={submitPending ? 'Cancel pending request' : 'Stop'} position="above">
              <button
                type="button"
                className="deploy-btn stop icon-only"
                onMouseDown={handleStopPress}
                onKeyDown={handleStopKey}
                aria-label={submitPending ? 'Cancel pending request' : 'Stop'}
              >
                <span className="ico ico-stop" aria-hidden="true" />
              </button>
            </PortalTooltip>
          ) : (
            <PortalTooltip text="Deploy" position="above">
              <button
                className="deploy-btn icon-only"
                onClick={submit}
                disabled={disabled || !v.trim() || !providerConfigured}
                aria-label="Deploy"
              >
                <span className="ico ico-deploy" aria-hidden="true" />
              </button>
            </PortalTooltip>
          )}
        </div>
      </div>
    </div>
  );
}


// 工具名 → 专属 icon class（用 .ico-* mask-image 系统）。
// 比如 web_search / web_fetch / fetch_url 都该用 globe 图标，而不是默认扳手。
// 匹配顺序按更具体的关键词在前。
