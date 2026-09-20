import React from 'react';
import { ArrowUp, BookOpen, CornerDownLeft, Square } from 'lucide-react';
import { PortalTooltip } from '../../../shared/ui/PortalTooltip.jsx';
import { AttachmentFileChip } from '../../../shared/ui/AttachmentFileChip.jsx';
import { firstPastedDocument } from '../model/document-paste.js';
import { composePathReferenceDraft, splitPathReferenceDraft, transferredLocalPaths } from '../model/path-references.js';
import {
  extractAgentSkillInvocation,
  matchingAgentSkills,
  withSelectedSkillInstruction,
} from '../../agents/model/agent-settings.js';
import { formatContextUsageLabel } from '../../../shared/lib/message-format.js';
import { contextSectorPath } from '../../../shared/lib/context-usage-ring.js';
import {
  usePersistentRunConfig,
  useProviderModels,
} from '../hooks/useRunConfig.js';
import { DEFAULT_AGENT_OPTIONS } from '../model/run-catalog.js';
import {
  ApprovalModePicker,
  ModelPicker,
} from './ModelPickers.jsx';
import { LexicalComposerInput } from './LexicalComposerInput.jsx';
import { ComposerBorderBeam, MetalActionEffect } from '../../../shared/ui/MotionEffects.jsx';

/**
 * 输入框只有这一套：聊天详情和工作流运行时（Task Delegation）共用本组件。
 * 两个使用方传的是同一份草稿（AppShell 的 chatDraft），差别只在：
 * - agent 列表（聊天是 agent，工作流是 workflow）与选择回调；
 * - `skills` / `history` / `beforeInput` / `pendingCommentCount` 这些聊天独有的东西
 *   （工作流不传，就没有技能菜单、没有 ↑ 历史、没有批注）；
 * - `allowRuntimeInput`：聊天在跑的时候可以把新输入当纠偏指令发出去，工作流不发（只给 Stop）。
 */
const CHAT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const CHAT_IMAGE_MAX_COUNT = 4;
const CHAT_IMAGE_ACCEPTED_MIME = new Set([
  'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif',
]);
const EMPTY_SKILLS = [];
const EMPTY_HISTORY = [];
const EMPTY_ANNOTATIONS = [];

export function ChatComposer({
  scopeId,
  draft: draftProp,
  onDraftChange: onDraftChangeProp,
  onSend,
  onStop,
  onSent,
  activeTaskText,
  running = false,
  disabled = false,
  submitPending = false,
  idlePlaceholder = 'Ask, draft, or delegate...',
  disabledPlaceholder = '',
  allowRuntimeInput = true,
  prepareSubmit,
  pendingCommentCount = 0,
  beforeInput = null,
  attachment,
  uploading = false,
  onSelectFile,
  onClearFile,
  imageStore,
  onPreviewImage,
  history = EMPTY_HISTORY,
  providerOptions = [],
  agentOptions,
  defaultAgentId,
  agentLoading = false,
  agentLocked = false,
  agentLockedReason = '',
  lockedAgentId = '',
  selectionStorageKey = '',
  onRunConfigChange,
  onAgentChange,
  contextUsage,
  inputRef: inputRefProp,
}) {
  const resolvedProviderOptions = Array.isArray(providerOptions) && providerOptions.length > 0
    ? providerOptions
    : [];
  const resolvedAgentOptions = Array.isArray(agentOptions) && agentOptions.length > 0 ? agentOptions : DEFAULT_AGENT_OPTIONS;
  const resolvedDefaultAgentId = defaultAgentId || resolvedAgentOptions[0]?.id || DEFAULT_AGENT_OPTIONS[0].id;
  const [localDraft, setLocalDraft] = React.useState('');
  const [runtimeInputPending, setRuntimeInputPending] = React.useState(false);
  const [selectedSkillName, setSelectedSkillName] = React.useState('');
  const [skillMenuIndex, setSkillMenuIndex] = React.useState(0);
  const [skillMenuDismissed, setSkillMenuDismissed] = React.useState(false);
  const selectedSkillNameRef = React.useRef('');
  const skillSelectionPendingRef = React.useRef(false);
  const draft = draftProp !== undefined ? draftProp : localDraft;
  const setDraft = draftProp !== undefined ? onDraftChangeProp : setLocalDraft;
  const localInputRef = React.useRef(null);
  const inputRef = inputRefProp || localInputRef;
  const suppressSubmitUntilRef = React.useRef(0);
  const historyCursorRef = React.useRef(-1);
  const historySavedDraftRef = React.useRef('');
  const [pathNotice, setPathNotice] = React.useState('');
  React.useEffect(() => setPathNotice(''), [scopeId, draft]);

  const { providerId, setProviderId, modelId, setModelId, agentId, setAgentId, reasoningEffort, setReasoningEffort } = usePersistentRunConfig({
    selectionStorageKey,
    providerOptions: resolvedProviderOptions,
    agentOptions: resolvedAgentOptions,
    defaultAgentId: resolvedDefaultAgentId,
  });
  const effectiveAgentId = agentLocked && lockedAgentId ? lockedAgentId : agentId;
  const currentSelection = resolvedAgentOptions.find((item) => item.id === effectiveAgentId);
  const resolvedSkills = currentSelection?.skills || EMPTY_SKILLS;
  const selectedSkill = resolvedSkills.find((skill) => skill.name === selectedSkillName) || null;
  const composerContent = React.useMemo(() => splitPathReferenceDraft(draft), [draft]);
  const matchingSkills = React.useMemo(
    () => matchingAgentSkills(composerContent.text, resolvedSkills),
    [composerContent.text, resolvedSkills],
  );
  const skillMenuOpen = Boolean(matchingSkills?.length && !selectedSkill && !skillMenuDismissed);
  const skillMenuRef = React.useRef(null);
  React.useEffect(() => {
    skillMenuRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [skillMenuIndex, skillMenuOpen]);
  const canUploadDocuments = currentSelection?.canUploadDocuments === true;
  const currentProvider = resolvedProviderOptions.find((item) => item.id === providerId) || resolvedProviderOptions[0];
  const providerModels = useProviderModels(currentProvider);
  const activeModelOptions = providerModels.options;
  const modelLoading = providerModels.loading;
  const providerRequest = currentProvider?.requestProvider || currentProvider?.provider || providerId || '';
  const providerConfigured = Boolean(currentProvider && providerRequest);
  const sendModelId = activeModelOptions.some((item) => item.id === modelId)
    ? modelId
    : (providerModels.defaultModelId || currentProvider?.defaultModelId || modelId);

  React.useEffect(() => {
    if (modelLoading) return;
    const nextModelId = activeModelOptions.some((item) => item.id === modelId)
      ? modelId
      : providerModels.defaultModelId;
    if (nextModelId !== modelId) setModelId(nextModelId);
  }, [activeModelOptions, modelId, modelLoading, providerModels.defaultModelId, setModelId]);
  React.useEffect(() => onAgentChange?.(effectiveAgentId), [effectiveAgentId, onAgentChange]);
  React.useEffect(() => {
    const modelConfigured = !modelLoading && activeModelOptions.some((item) => item.id === modelId);
    onRunConfigChange?.(
      providerConfigured && modelConfigured
        ? { provider: providerRequest, modelId, reasoningEffort }
        : null,
    );
  }, [activeModelOptions, modelId, modelLoading, onRunConfigChange, providerConfigured, providerRequest, reasoningEffort]);

  // The logical composer scope remains stable while a local draft receives its
  // server id, and changes only when the user actually switches conversations.
  React.useEffect(() => {
    setSelectedSkillName('');
    selectedSkillNameRef.current = '';
    skillSelectionPendingRef.current = false;
    setSkillMenuDismissed(false);
  }, [scopeId]);

  React.useEffect(() => {
    if (selectedSkillName && !resolvedSkills.some((skill) => skill.name === selectedSkillName)) {
      setSelectedSkillName('');
      selectedSkillNameRef.current = '';
      skillSelectionPendingRef.current = false;
    }
  }, [resolvedSkills, selectedSkillName]);

  const [, refreshImages] = React.useReducer((value) => value + 1, 0);
  const localImageDrafts = React.useRef(new Map());
  const imageStoreRef = imageStore || localImageDrafts.current;
  const currentComposerScopeRef = React.useRef(scopeId);
  currentComposerScopeRef.current = scopeId;
  const composerImages = imageStoreRef.get(scopeId) || [];
  const setComposerImages = (update) => {
    const previous = imageStoreRef.get(scopeId) || [];
    const next = typeof update === 'function' ? update(previous) : update;
    if (next.length) imageStoreRef.set(scopeId, next);
    else imageStoreRef.delete(scopeId);
    refreshImages();
  };

  function attachImageFile(file) {
    if (!file) return;
    if (!CHAT_IMAGE_ACCEPTED_MIME.has((file.type || '').toLowerCase())) {
      console.warn('Unsupported image type', file.type);
      return;
    }
    if (file.size > CHAT_IMAGE_MAX_BYTES) {
      const rejected = {
        id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        previewUrl: '',
        uploading: false,
        error: `File too large (>${Math.round(CHAT_IMAGE_MAX_BYTES / 1024 / 1024)}MB)`,
      };
      setComposerImages((prev) => [...prev, rejected]);
      return;
    }
    if ((imageStoreRef.get(scopeId)?.length || 0) >= CHAT_IMAGE_MAX_COUNT) {
      console.warn(`Image limit reached (${CHAT_IMAGE_MAX_COUNT})`);
      return;
    }

    const id = `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const previewUrl = URL.createObjectURL(file);
    setComposerImages((prev) => [...prev, { id, file, previewUrl, uploading: false }]);
  }

  function removeComposerImage(id) {
    setComposerImages((prev) => {
      const target = prev.find((img) => img.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((img) => img.id !== id);
    });
  }

  function handleComposerPaste(event) {
    const items = Array.from(event.clipboardData?.items || []);
    const imageFiles = items
      .filter((it) => it.kind === 'file' && (it.type || '').toLowerCase().startsWith('image/'))
      .map((it) => it.getAsFile())
      .filter(Boolean);

    if (imageFiles.length === 0) {
      const clipboard = event.clipboardData;
      if (!clipboard) return;
      const document = canUploadDocuments && firstPastedDocument(clipboard);
      if (document) {
        event.preventDefault();
        if (!disabled && !submitPending && !running && !uploading) onSelectFile?.(document, effectiveAgentId);
        return;
      }
      const pathText = transferredLocalPaths(clipboard);
      if (pathText) {
        event.preventDefault();
        insertLocalPaths(pathText);
      }
      return;
    }
    event.preventDefault();
    if (imageStore) imageFiles.forEach((file) => attachImageFile(file));
    const paths = transferredLocalPaths(event.clipboardData);
    if (paths) insertLocalPaths(paths);
  }

  function handleComposerDrop(event) {
    const files = Array.from(event.dataTransfer?.files || []);
    const paths = transferredLocalPaths(event.dataTransfer);
    if (!files.length && !paths) return;
    event.preventDefault();
    event.stopPropagation();
    if (disabled) return;
    if (imageStore) files.filter((file) => (file.type || '').toLowerCase().startsWith('image/')).forEach(attachImageFile);
    if (paths) insertLocalPaths(paths);
    else if (files.some((file) => !String(file.type || '').startsWith('image/'))) {
      setPathNotice('Local path unavailable. Copy the full path and paste it instead.');
    }
  }

  function insertLocalPaths(text) {
    if (disabled) return;
    if (!inputRef.current?.insertText(text)) {
      setPathNotice('The reference exceeds the message limit (5,000 characters). Shorten the draft and try again.');
    }
  }

  function handleComposerDragOver(event) {
    if (Array.from(event.dataTransfer?.items || []).some((it) => it.kind === 'file')) {
      event.preventDefault();
    }
  }

  const imagesUploading = composerImages.some((img) => img.uploading);
  const readyImages = imageStore
    ? composerImages
        .filter((img) => (img.file || img.imageId) && !img.error)
        .map((img) => ({
          image_id: img.imageId,
          file: img.file,
          path: img.path,
          mime: img.mime,
          previewUrl: img.previewUrl || null,
        }))
    : [];
  const hasComposerPayload = Boolean(draft.trim() || composerImages.length > 0 || pendingCommentCount);
  const canSubmitPayload = Boolean((draft.trim() || readyImages.length > 0 || pendingCommentCount) && !imagesUploading && !(running && pendingCommentCount));

  const usedTokens = Math.max(0, Math.round(Number(contextUsage?.usedTokens) || 0));
  const totalTokens = Math.max(0, Math.round(Number(contextUsage?.totalTokens) || 0));
  const contextRatio = Math.max(0, Math.min(1, Number(contextUsage?.ratio) || (totalTokens > 0 ? usedTokens / totalTokens : 0)));
  const visibleContextRatio = usedTokens > 0 ? Math.max(contextRatio, 0.01) : 0;
  const contextTooltip = `${formatContextUsageLabel(usedTokens, totalTokens, { estimated: Boolean(contextUsage?.estimated) })}${contextUsage?.overLimit ? ' · Over limit' : ''}`;
  const contextSector = contextSectorPath(visibleContextRatio);
  const runConfigReadOnly = running || submitPending;
  const runConfigDisabled = !runConfigReadOnly && (disabled || submitPending);
  // The send/stop metal ring is a state signal, not decoration: it lights up as
  // soon as the composer holds something sendable (typed text, images, or
  // annotation drafts) and keeps running while work is in flight. Gating on
  // `running || submitPending` alone left the button visually dead for the
  // whole time the user was typing — the ring only appeared after the send.
  const sendBeamActive = running || submitPending || hasComposerPayload;
  const placeholder = !providerConfigured ? 'Configure an LLM provider in Settings first...'
    : submitPending ? 'Preparing conversation...'
      : uploading ? 'Document is processing. Please wait...'
        : disabled ? (disabledPlaceholder || idlePlaceholder)
          : running && allowRuntimeInput ? 'Add instructions while the assistant is working...'
            : idlePlaceholder;

  const restoreActiveTaskText = React.useCallback((value = activeTaskText) => {
    const text = String(value || '').trim();
    if (!text) return;
    skillSelectionPendingRef.current = false;
    setDraft(text);
    requestAnimationFrame(() => {
      inputRef.current?.focusAtEnd?.();
    });
  }, [activeTaskText, setDraft, inputRef]);

  const stopAndRestore = React.useCallback(() => {
    const restoreText = onStop?.();
    if (restoreText) restoreActiveTaskText(restoreText);
  }, [onStop, restoreActiveTaskText]);

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
  }, [running, submitPending, stopAndRestore]);

  const clearComposerAfterSend = () => {
    if (currentComposerScopeRef.current !== scopeId) {
      setComposerImages([]);
      return;
    }
    onSent?.();
    setDraft('');
    setSelectedSkillName('');
    selectedSkillNameRef.current = '';
    skillSelectionPendingRef.current = false;
  };

  async function submit(e) {
    e?.preventDefault();
    e?.stopPropagation?.();
    if (Date.now() < suppressSubmitUntilRef.current) return;
    if (skillSelectionPendingRef.current) return;
    const text = draft.trim();
    if ((!text && readyImages.length === 0 && !pendingCommentCount) || imagesUploading || disabled || submitPending || runtimeInputPending) return;
    if (running && (!allowRuntimeInput || pendingCommentCount)) return;
    const skillInvocation = selectedSkill || !text ? null : extractAgentSkillInvocation(composerContent.text, resolvedSkills);
    const submittedText = selectedSkill
      ? withSelectedSkillInstruction(text, selectedSkill)
      : skillInvocation
        ? withSelectedSkillInstruction(composePathReferenceDraft(skillInvocation.prompt, composerContent.references), skillInvocation.skill)
        : text;
    // 聊天用它校验批注并把批注快照带回 onSend；工作流不传这一步。
    const prepared = prepareSubmit?.(submittedText, composerContent) || null;
    if (prepared?.error) return;
    if (running) {
      setRuntimeInputPending(true);
      try {
        const accepted = await onSend?.(submittedText, null, sendModelId, reasoningEffort, readyImages, effectiveAgentId, providerRequest, text);
        if (accepted !== false) clearComposerAfterSend();
      } finally {
        setRuntimeInputPending(false);
      }
      return;
    }
    if (!providerConfigured) return;
    if (!sendModelId) return;
    if (!resolvedAgentOptions.some((o) => o.id === effectiveAgentId)) return;
    const sendResult = onSend?.(submittedText, attachment, sendModelId, reasoningEffort, readyImages, effectiveAgentId, providerRequest, text, prepared?.annotations || EMPTY_ANNOTATIONS);
    // Local acceptance is synchronous: clear the composer in the same render as
    // its optimistic message. Only async send handlers need a separate wait.
    const accepted = sendResult && typeof sendResult.then === 'function' ? await sendResult : sendResult;
    if (accepted === false) return;
    clearComposerAfterSend();
    onClearFile?.();
    // Keep blob URLs alive for the sent message's thumbnails across switches.
    setComposerImages([]);
  }

  function clearFile(e) {
    e.stopPropagation();
    onClearFile?.();
  }

  function selectSkill(skill, event) {
    if (!skill) return;
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const prompt = composerContent.text.match(/^\s*\/[a-z0-9-]*(?:\s+([\s\S]*))?$/i)?.[1] || '';
    selectedSkillNameRef.current = skill.name;
    skillSelectionPendingRef.current = !prompt.trim() && !composerContent.references.length;
    setSelectedSkillName(skill.name);
    setDraft(composePathReferenceDraft(prompt, composerContent.references));
    setSkillMenuDismissed(false);
    requestAnimationFrame(() => inputRef.current?.focusAtEnd?.());
  }

  React.useEffect(() => {
    if (!canUploadDocuments && attachment) onClearFile?.();
  }, [canUploadDocuments, attachment, onClearFile]);

  return (
    <form
      className="chat-composer"
      onSubmit={submit}
      onDragOver={handleComposerDragOver}
      onDropCapture={handleComposerDrop}
    >
      <ComposerBorderBeam active={running || submitPending || hasComposerPayload} />
      {beforeInput}
      {pathNotice && <p className="haish-annotation-notice" role="status">{pathNotice}</p>}
      {skillMenuOpen && (
        <div ref={skillMenuRef} className="chat-skill-menu" role="listbox" aria-label="Available skills">
          {matchingSkills.map((skill, index) => (
            <button
              key={skill.name}
              type="button"
              role="option"
              aria-selected={index === skillMenuIndex}
              title={`/${skill.name}${skill.description ? ` — ${skill.description}` : ''}`}
              className={`chat-skill-menu-item${index === skillMenuIndex ? ' is-active' : ''}`}
              onMouseDown={(event) => {
                selectSkill(skill, event);
              }}
              onMouseEnter={() => setSkillMenuIndex(index)}
            >
              <BookOpen className="chat-skill-menu-icon" size={15} strokeWidth={1.5} aria-hidden="true" />
              <span className="chat-skill-menu-name">/{skill.name}</span>
              {skill.description ? (
                <span className="chat-skill-menu-description">{skill.description}</span>
              ) : null}
              <span className="chat-skill-menu-enter" aria-hidden="true"><CornerDownLeft size={12} /></span>
            </button>
          ))}
        </div>
      )}
      <div className="chat-composer-input-row">
        <LexicalComposerInput
          key={scopeId}
          ref={inputRef}
          value={draft}
          selectedSkill={selectedSkill}
          attachments={(composerImages.length > 0 || attachment) && (
            <>
              {attachment && (
                <AttachmentFileChip attachment={attachment} uploading={uploading} onClear={clearFile} />
              )}
              {composerImages.length > 0 && (
                <div className="chat-composer-images" aria-label="Pasted images">
                  {composerImages.map((img) => (
                    <PortalTooltip
                      key={img.id}
                      text={img.error || (img.uploading ? 'Uploading...' : (img.file?.name || 'image'))}
                      position="above"
                    >
                      <div
                        className={`chat-composer-image-chip ${img.uploading ? 'is-uploading' : ''} ${img.error ? 'has-error' : ''}`}
                      >
                        <button
                          type="button"
                          className="chat-composer-image-preview-button"
                          onClick={() => onPreviewImage?.({
                            src: img.previewUrl || img.path,
                            title: img.file?.name || img.path || 'Pasted image',
                          })}
                          disabled={!img.previewUrl && !img.path}
                          aria-label="Preview pasted image"
                        >
                          {img.previewUrl ? (
                            <img src={img.previewUrl} alt="" draggable={false} />
                          ) : (
                            <span className="chat-composer-image-fallback" aria-hidden="true">!</span>
                          )}
                        </button>
                        {img.uploading && <span className="chat-composer-image-spinner" aria-hidden="true" />}
                        <button
                          type="button"
                          className="chat-composer-image-remove"
                          onClick={() => removeComposerImage(img.id)}
                          aria-label="Remove image"
                        >×</button>
                      </div>
                    </PortalTooltip>
                  ))}
                </div>
              )}
            </>
          )}
          onRemoveSkill={() => {
            selectedSkillNameRef.current = '';
            skillSelectionPendingRef.current = false;
            setSelectedSkillName('');
          }}
          onChange={(nextDraft) => {
            if (skillSelectionPendingRef.current) {
              const selectedQuery = selectedSkillNameRef.current
                ? `/${selectedSkillNameRef.current}`.toLowerCase()
                : '';
              const nextContent = splitPathReferenceDraft(nextDraft);
              const normalizedDraft = nextContent.text.trim().toLowerCase();
              if (!normalizedDraft || normalizedDraft === selectedQuery) {
                skillSelectionPendingRef.current = !nextContent.references.length;
                setDraft(composePathReferenceDraft('', nextContent.references));
                return;
              }
              skillSelectionPendingRef.current = false;
            }
            setDraft(nextDraft);
            setSkillMenuDismissed(false);
            setSkillMenuIndex(0);
          }}
          onPaste={handleComposerPaste}
          onPathLimit={() => setPathNotice('The reference exceeds the message limit (5,000 characters). Shorten the draft and try again.')}
          onKeyDown={(event) => {
            if (
              event.key === 'Backspace'
              && !event.nativeEvent.isComposing
              && selectedSkill
              && inputRef.current?.isSelectionAtStart()
            ) {
              event.preventDefault();
              event.stopPropagation();
              selectedSkillNameRef.current = '';
              skillSelectionPendingRef.current = false;
              setSelectedSkillName('');
              return;
            }
            if (skillMenuOpen && !event.nativeEvent.isComposing) {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                event.stopPropagation();
                if (matchingSkills.length) {
                  const delta = event.key === 'ArrowDown' ? 1 : -1;
                  setSkillMenuIndex((index) => (index + delta + matchingSkills.length) % matchingSkills.length);
                }
                return;
              }
              if ((event.key === 'Enter' || event.key === 'Tab') && matchingSkills.length) {
                selectSkill(matchingSkills[skillMenuIndex] || matchingSkills[0], event);
                return;
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                setSkillMenuDismissed(true);
                return;
              }
            }
            if (event.key === 'Escape' && running && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.stopPropagation();
              stopAndRestore();
              return;
            }
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit(event);
              return;
            }
            // ArrowUp / ArrowDown history navigation (terminal-style).
            if (event.key === 'ArrowUp' && !event.shiftKey && !event.nativeEvent.isComposing) {
              if (!inputRef.current?.isSelectionAtStart()) return;
              event.preventDefault();
              event.stopPropagation();
              if (history.length === 0) return;
              const cursor = historyCursorRef.current;
              if (cursor === -1) {
                historySavedDraftRef.current = draft;
              }
              const nextCursor = Math.min(cursor + 1, history.length - 1);
              historyCursorRef.current = nextCursor;
              setDraft(history[nextCursor]);
              requestAnimationFrame(() => inputRef.current?.focusAtEnd());
              return;
            }
            if (event.key === 'ArrowDown' && !event.shiftKey && !event.nativeEvent.isComposing) {
              if (!inputRef.current?.isSelectionAtEnd()) return;
              event.preventDefault();
              event.stopPropagation();
              const cursor = historyCursorRef.current;
              if (cursor <= 0) {
                historyCursorRef.current = -1;
                setDraft(historySavedDraftRef.current);
                return;
              }
              const nextCursor = cursor - 1;
              historyCursorRef.current = nextCursor;
              setDraft(history[nextCursor]);
              requestAnimationFrame(() => inputRef.current?.focusAtEnd());
              return;
            }
            // Any non-modifier key resets the history cursor.
            if (!['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab'].includes(event.key)) {
              historyCursorRef.current = -1;
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          maxLength={5000}
        />
      </div>
      <div className="chat-composer-actions">
        <div className="chat-composer-tools">
          <ApprovalModePicker readOnly={runConfigReadOnly} disabled={runConfigDisabled} />
        </div>
        <div className="chat-composer-submit">
          {totalTokens > 0 ? <PortalTooltip text={contextTooltip} position="above">
            <button
              type="button"
              className={`context-usage-btn icon-only ${contextUsage?.compressed ? 'compressed' : ''} ${contextUsage?.overLimit ? 'over-limit' : ''}`}
              aria-label={contextTooltip}
              aria-disabled="true"
            >
              <span className="context-usage-icon" aria-hidden="true">
                <svg className="context-usage-icon-ring" viewBox="0 0 24 24">
                  <path className="context-usage-icon-sector" d={contextSector} />
                  <circle cx="12" cy="12" r="10.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeDasharray="2.2 4.4" strokeLinecap="round" />
                </svg>
              </span>
            </button>
          </PortalTooltip> : null}
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
          {submitPending ? (
            <MetalActionEffect active={sendBeamActive}>
              <button type="button" className="chat-send stop" onMouseDown={handleStopPress} onKeyDown={handleStopKey} aria-label="Cancel pending request">
                <Square className="chat-send-icon chat-stop-icon" fill="currentColor" strokeWidth={0} aria-hidden="true" />
              </button>
            </MetalActionEffect>
          ) : running && allowRuntimeInput && hasComposerPayload && !pendingCommentCount ? (
            // Running + user typed a mid-run instruction: replace Stop with Send,
            // so Stop and Send never appear side by side. Sending clears the
            // draft and the button flips back to Stop.
            <MetalActionEffect active={sendBeamActive}>
              <button type="submit" className="chat-send" disabled={disabled || runtimeInputPending || !canSubmitPayload} aria-label="Add instruction">
                <ArrowUp className="chat-send-icon" strokeWidth={2.3} aria-hidden="true" />
              </button>
            </MetalActionEffect>
          ) : running ? (
            <MetalActionEffect active={sendBeamActive}>
              <button type="button" className="chat-send stop" onMouseDown={handleStopPress} onKeyDown={handleStopKey} aria-label="Stop">
                <Square className="chat-send-icon chat-stop-icon" fill="currentColor" strokeWidth={0} aria-hidden="true" />
              </button>
            </MetalActionEffect>
          ) : (
            <MetalActionEffect active={sendBeamActive}>
              <button type="submit" className="chat-send" disabled={disabled || !canSubmitPayload || !providerConfigured || !sendModelId} aria-label="Send">
                <ArrowUp className="chat-send-icon" strokeWidth={2.3} aria-hidden="true" />
              </button>
            </MetalActionEffect>
          )}
        </div>
      </div>
    </form>
  );
}
