import React from 'react';
import { PenguinCards } from './PenguinCards.jsx';
import { ConversationSearch } from './ConversationSearch.jsx';
import { ArrowUp, BookOpen, CornerDownLeft, Square } from 'lucide-react';
import { ApprovalInline } from '../../approvals/components/ApprovalOverlay.jsx';
import {
  extractAgentSkillInvocation,
  matchingAgentSkills,
  withSelectedSkillInstruction,
} from '../../agents/model/agent-settings.js';
import { PortalTooltip } from '../../../shared/ui/PortalTooltip.jsx';
import { AttachmentFileChip } from '../../../shared/ui/AttachmentFileChip.jsx';
import { firstPastedDocument } from '../model/document-paste.js';
import {
  clipboardFilesToPathText,
  clipboardUriListToPathText,
  normalizePastedPathText,
} from '../model/path-input.js';
import { formatContextUsageLabel } from '../../../shared/lib/message-format.js';
import {
  usePersistentRunConfig,
  useProviderModels,
} from '../hooks/useRunConfig.js';
import { DEFAULT_AGENT_OPTIONS } from '../model/run-catalog.js';
import {
  ApprovalModePicker,
  ModelPicker,
} from './ModelPickers.jsx';
import {
  ChatMessageRow,
  ImagePreviewOverlay,
} from './ChatMessageRow.jsx';
import { ScrollToBottomButton } from '../../../shared/ui/ScrollToBottomButton.jsx';
import { LexicalComposerInput } from './LexicalComposerInput.jsx';
import { ComposerBorderBeam, MetalActionEffect } from '../../../shared/ui/MotionEffects.jsx';
const CHAT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const CHAT_IMAGE_MAX_COUNT = 4;
const CHAT_IMAGE_ACCEPTED_MIME = new Set([
  'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif',
]);
const EMPTY_AGENT_SKILLS = [];

export function ChatPanel({
  conversationId,
  composerScopeId = conversationId,
  messages = [],
  running = false,
  disabled = false,
  submitPending = false,
  onSend,
  onStop,
  onSelectFile,
  onClearFile,
  imageDrafts,
  attachment,
  uploading,
  contextUsage,
  workspacePath,
  homePath,
  activeTaskText,
  providerOptions = [],
  agentOptions,
  defaultAgentId,
  agentLoading = false,
  agentLocked = false,
  agentLockedReason = '',
  lockedAgentId = '',
  selectionStorageKey = '',
  draft: draftProp,
  onDraftChange: onDraftChangeProp,
  onRetryTask,
}) {
  const resolvedProviderOptions = Array.isArray(providerOptions) && providerOptions.length > 0
    ? providerOptions
    : [];
  const resolvedAgentOptions = Array.isArray(agentOptions) && agentOptions.length > 0 ? agentOptions : DEFAULT_AGENT_OPTIONS;
  const resolvedDefaultAgentId = defaultAgentId || resolvedAgentOptions[0]?.id || DEFAULT_AGENT_OPTIONS[0].id;
  const [localDraft, setLocalDraft] = React.useState('');
  const [runtimeInputPending, setRuntimeInputPending] = React.useState(false);
  const [searchActive, setSearchActive] = React.useState(false);
  const [sendScrollKey, setSendScrollKey] = React.useState(0);
  const [selectedSkillName, setSelectedSkillName] = React.useState('');
  const [skillMenuIndex, setSkillMenuIndex] = React.useState(0);
  const [skillMenuDismissed, setSkillMenuDismissed] = React.useState(false);
  const selectedSkillNameRef = React.useRef('');
  const skillSelectionPendingRef = React.useRef(false);
  const draft = draftProp !== undefined ? draftProp : localDraft;
  const setDraft = draftProp !== undefined ? onDraftChangeProp : setLocalDraft;


  // Collect user messages for ArrowUp history navigation (most recent first).
  const userMessageHistory = React.useMemo(() => {
    return messages
      .filter((m) => m.role === 'user' && typeof m.text === 'string' && m.text.trim().length > 0)
      .map((m) => m.text)
      .reverse();
  }, [messages]);
  const { providerId, setProviderId, modelId, setModelId, agentId, setAgentId, reasoningEffort, setReasoningEffort } = usePersistentRunConfig({
    selectionStorageKey,
    providerOptions: resolvedProviderOptions,
    agentOptions: resolvedAgentOptions,
    defaultAgentId: resolvedDefaultAgentId,
  });
  const [, refreshImages] = React.useReducer((value) => value + 1, 0);
  const localImageDrafts = React.useRef(new Map());
  const imageStore = imageDrafts || localImageDrafts.current;
  const currentComposerScopeRef = React.useRef(composerScopeId);
  currentComposerScopeRef.current = composerScopeId;
  const composerImages = imageStore.get(composerScopeId) || [];
  const setComposerImages = (update) => {
    const previous = imageStore.get(composerScopeId) || [];
    const next = typeof update === 'function' ? update(previous) : update;
    if (next.length) imageStore.set(composerScopeId, next);
    else imageStore.delete(composerScopeId);
    refreshImages();
  };
  const [previewImage, setPreviewImage] = React.useState(null);
  const closeImagePreview = React.useCallback(() => setPreviewImage(null), []);
  const effectiveAgentId = agentLocked && lockedAgentId ? lockedAgentId : agentId;
  const currentSelection = resolvedAgentOptions.find((item) => item.id === effectiveAgentId);
  const currentAgentSkills = currentSelection?.skills || EMPTY_AGENT_SKILLS;
  const selectedSkill = currentAgentSkills.find((skill) => skill.name === selectedSkillName) || null;
  const matchingSkills = matchingAgentSkills(draft, currentAgentSkills);
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

  // The logical composer scope remains stable while a local draft receives its
  // server id, and changes only when the user actually switches conversations.
  React.useEffect(() => {
    setSelectedSkillName('');
    selectedSkillNameRef.current = '';
    skillSelectionPendingRef.current = false;
    setSkillMenuDismissed(false);
  }, [composerScopeId]);

  React.useEffect(() => {
    if (selectedSkillName && !currentAgentSkills.some((skill) => skill.name === selectedSkillName)) {
      setSelectedSkillName('');
      selectedSkillNameRef.current = '';
      skillSelectionPendingRef.current = false;
    }
  }, [currentAgentSkills, selectedSkillName]);

  function attachImageFile(file) {
    if (!file) return;
    if (!CHAT_IMAGE_ACCEPTED_MIME.has((file.type || '').toLowerCase())) {
      console.warn('Unsupported image type', file.type);
      return;
    }
    if (file.size > CHAT_IMAGE_MAX_BYTES) {
      const draft = {
        id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        previewUrl: '',
        uploading: false,
        error: `File too large (>${Math.round(CHAT_IMAGE_MAX_BYTES / 1024 / 1024)}MB)`,
      };
      setComposerImages((prev) => [...prev, draft]);
      return;
    }
    if ((imageStore.get(composerScopeId)?.length || 0) >= CHAT_IMAGE_MAX_COUNT) {
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
      const normalizedText = clipboardUriListToPathText(clipboard.getData('text/uri-list'), workspacePath, homePath)
        || clipboardFilesToPathText(clipboard.files, workspacePath, homePath)
        || normalizePastedPathText(clipboard.getData('text/plain'), workspacePath, homePath);
      if (normalizedText) {
        event.preventDefault();
        inputRef.current?.insertText(normalizedText);
      }
      return;
    }
    event.preventDefault();
    imageFiles.forEach((file) => attachImageFile(file));
  }

  function handleComposerDrop(event) {
    const files = Array.from(event.dataTransfer?.files || [])
      .filter((file) => (file.type || '').toLowerCase().startsWith('image/'));
    if (!files.length) return;
    event.preventDefault();
    files.forEach((file) => attachImageFile(file));
  }

  function handleComposerDragOver(event) {
    if (Array.from(event.dataTransfer?.items || []).some((it) => it.kind === 'file')) {
      event.preventDefault();
    }
  }

  const imagesUploading = composerImages.some((img) => img.uploading);
  const readyImages = composerImages
    .filter((img) => (img.file || img.imageId) && !img.error)
    .map((img) => ({
      image_id: img.imageId,
      file: img.file,
      path: img.path,
      mime: img.mime,
      previewUrl: img.previewUrl || null,
    }));
  const hasComposerPayload = Boolean(draft.trim() || composerImages.length > 0);
  const canSubmitPayload = Boolean((draft.trim() || readyImages.length > 0) && !imagesUploading);
  const openImagePreview = React.useCallback((image) => {
    const src = image?.src || image?.previewUrl || image?.path || '';
    if (!src) return;
    setPreviewImage({
      src,
      title: image?.title || image?.name || image?.path || 'image',
    });
  }, []);

  const listRef = React.useRef(null);
  const inputRef = React.useRef(null);
  const suppressSubmitUntilRef = React.useRef(0);
  const historyCursorRef = React.useRef(-1);
  const historySavedDraftRef = React.useRef('');
  const usedTokens = Math.max(0, Math.round(Number(contextUsage?.usedTokens) || 0));
  const totalTokens = Math.max(0, Math.round(Number(contextUsage?.totalTokens) || 0));
  const contextRatio = Math.max(0, Math.min(1, Number(contextUsage?.ratio) || (totalTokens > 0 ? usedTokens / totalTokens : 0)));
  const visibleContextRatio = usedTokens > 0 ? Math.max(contextRatio, 0.01) : 0;
  const contextTooltip = `${formatContextUsageLabel(usedTokens, totalTokens)}${contextUsage?.overLimit ? ' · Over limit' : ''}`;
  const contextRingStyle = {
    '--context-used': `${visibleContextRatio * 100}%`,
  };
  const runConfigReadOnly = running || submitPending;
  const runConfigDisabled = !runConfigReadOnly && (disabled || submitPending);

  const restoreActiveTaskText = React.useCallback((value = activeTaskText) => {
    const text = String(value || '').trim();
    if (!text) return;
    skillSelectionPendingRef.current = false;
    setDraft(text);
    requestAnimationFrame(() => {
      inputRef.current?.focusAtEnd?.();
    });
  }, [activeTaskText, setDraft]);

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

  async function submit(e) {
    e?.preventDefault();
    e?.stopPropagation?.();
    if (Date.now() < suppressSubmitUntilRef.current) return;
    if (skillSelectionPendingRef.current) return;
    const text = draft.trim();
    if ((!text && readyImages.length === 0) || imagesUploading || disabled || submitPending || runtimeInputPending) return;
    const skillInvocation = selectedSkill || !text ? null : extractAgentSkillInvocation(text, currentAgentSkills);
    const submittedText = selectedSkill
      ? withSelectedSkillInstruction(text, selectedSkill)
      : skillInvocation
        ? withSelectedSkillInstruction(skillInvocation.prompt, skillInvocation.skill)
        : text;
    if (running) {
      setRuntimeInputPending(true);
      try {
        const accepted = await onSend?.(submittedText, null, sendModelId, reasoningEffort, readyImages, effectiveAgentId, providerRequest, text);
        if (accepted !== false) {
          if (currentComposerScopeRef.current !== composerScopeId) { setComposerImages([]); return; }
          setSendScrollKey((value) => value + 1);
          setDraft('');
          setSelectedSkillName('');
          selectedSkillNameRef.current = '';
          skillSelectionPendingRef.current = false;
          setComposerImages([]);
        }
      } finally {
        setRuntimeInputPending(false);
      }
      return;
    }
    if (!providerConfigured) return;
    if (!sendModelId) return;
    if (!resolvedAgentOptions.some((o) => o.id === effectiveAgentId)) return;
    const accepted = await onSend?.(submittedText, attachment, sendModelId, reasoningEffort, readyImages, effectiveAgentId, providerRequest, text);
    if (accepted === false) return;
    if (currentComposerScopeRef.current !== composerScopeId) { setComposerImages([]); return; }
    setSendScrollKey((value) => value + 1);
    setDraft('');
    setSelectedSkillName('');
    selectedSkillNameRef.current = '';
    skillSelectionPendingRef.current = false;
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
    const prompt = String(draft || '').match(/^\s*\/[a-z0-9-]*(?:\s+([\s\S]*))?$/i)?.[1] || '';
    selectedSkillNameRef.current = skill.name;
    skillSelectionPendingRef.current = !prompt.trim();
    setSelectedSkillName(skill.name);
    setDraft(prompt);
    setSkillMenuDismissed(false);
    requestAnimationFrame(() => inputRef.current?.focusAtEnd?.());
  }

  React.useEffect(() => {
    if (!canUploadDocuments && attachment) onClearFile?.();
  }, [canUploadDocuments, attachment, onClearFile]);

  return (
    <section className="chat-workspace" aria-label="Chat">
      <div className="chat-message-region">
        <ConversationSearch key={conversationId || 'draft'} scrollRef={listRef} onSearchChange={setSearchActive} />
        <div ref={listRef} className={`chat-message-list${searchActive ? ' is-searching' : ''}`}>
          {messages.length === 0 ? (
            <div className="chat-empty">
              <PenguinCards />
              <div className="chat-empty-title">What's on your mind?</div>
              <div className="chat-empty-copy">Drop a task, a question, or a loose idea. I'll take it from there.</div>
            </div>
          ) : messages.map((message) => (
            <ChatMessageRow
              key={message.id}
              message={searchActive ? { ...message, traceOpen: true } : message}
              onPreviewImage={openImagePreview}
              onRetry={message.role === 'agent' && message.status === 'failed' && message.taskId
                ? () => onRetryTask?.(message.taskId)
                : null}
            />
          ))}
          <ApprovalInline />
        </div>
        {messages.length > 0 ? (
          <ScrollToBottomButton scrollRef={listRef} autoFollow={!searchActive} resetKey={`${conversationId || ''}:${sendScrollKey}`} />
        ) : null}
      </div>
      <form
        className="chat-composer"
        onSubmit={submit}
        onDragOver={handleComposerDragOver}
        onDrop={handleComposerDrop}
      >
        <ComposerBorderBeam active={running || submitPending || hasComposerPayload} />
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
        {(composerImages.length > 0 || attachment) && (
          <div className="chat-composer-attachments" aria-label="Attachments">
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
                        onClick={() => openImagePreview({
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
          </div>
        )}
        <div className="chat-composer-input-row">
          <LexicalComposerInput
            key={composerScopeId}
            ref={inputRef}
            value={draft}
            selectedSkill={selectedSkill}
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
                const normalizedDraft = String(nextDraft || '').trim().toLowerCase();
                if (!normalizedDraft || normalizedDraft === selectedQuery) {
                  setDraft('');
                  return;
                }
                skillSelectionPendingRef.current = false;
              }
              setDraft(nextDraft);
              setSkillMenuDismissed(false);
              setSkillMenuIndex(0);
            }}
            onPaste={handleComposerPaste}
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
              const history = userMessageHistory;
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
              const history = userMessageHistory;
              setDraft(history[nextCursor]);
              requestAnimationFrame(() => inputRef.current?.focusAtEnd());
              return;
            }
            // Any non-modifier key resets the history cursor.
            if (!['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab'].includes(event.key)) {
              historyCursorRef.current = -1;
            }
            }}
            placeholder={!providerConfigured ? 'Configure an LLM provider in Settings first...' : submitPending ? 'Preparing conversation...' : running ? 'Add instructions while the assistant is working...' : 'Ask, draft, or delegate...'}
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
                <span className="context-usage-icon" style={contextRingStyle} aria-hidden="true">
                  <svg className="context-usage-icon-ring" viewBox="0 0 24 24">
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
              <MetalActionEffect>
                <button type="button" className="chat-send stop" onMouseDown={handleStopPress} onKeyDown={handleStopKey} aria-label="Cancel pending request">
                  <Square className="chat-send-icon chat-stop-icon" fill="currentColor" strokeWidth={0} aria-hidden="true" />
                </button>
              </MetalActionEffect>
            ) : running && hasComposerPayload ? (
              // Running + user typed a mid-run instruction: replace Stop with Send,
              // so Stop and Send never appear side by side. Sending clears the
              // draft and the button flips back to Stop.
              <MetalActionEffect>
                <button type="submit" className="chat-send" disabled={disabled || runtimeInputPending || !canSubmitPayload} aria-label="Add instruction">
                  <ArrowUp className="chat-send-icon" strokeWidth={2.3} aria-hidden="true" />
                </button>
              </MetalActionEffect>
            ) : running ? (
              <MetalActionEffect>
                <button type="button" className="chat-send stop" onMouseDown={handleStopPress} onKeyDown={handleStopKey} aria-label="Stop">
                  <Square className="chat-send-icon chat-stop-icon" fill="currentColor" strokeWidth={0} aria-hidden="true" />
                </button>
              </MetalActionEffect>
            ) : (
              <MetalActionEffect>
                <button type="submit" className="chat-send" disabled={disabled || !canSubmitPayload || !providerConfigured || !sendModelId} aria-label="Send">
                  <ArrowUp className="chat-send-icon" strokeWidth={2.3} aria-hidden="true" />
                </button>
              </MetalActionEffect>
            )}
          </div>
        </div>
      </form>
      <ImagePreviewOverlay image={previewImage} onClose={closeImagePreview} />
    </section>
  );
}
