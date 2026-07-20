// @haish-esm
import React from 'react';
import { CHAR_DEFS } from '../Sprites.jsx';
import { PortalTooltip } from './PortalTooltip.jsx';
import { AttachmentFileChip } from './Format.jsx';
import {
  formatElapsedDuration,
  formatMessageClock,
  handlePathPaste,
  formatContextUsageLabel,
  usePersistentRunConfig,
  useProviderModels,
  copyTextToClipboard,
} from './path-utils.jsx';
import { DEFAULT_AGENT_OPTIONS, CATEGORY_ICON_CLASS, CATEGORY_LABEL } from './shared-constants.jsx';
import {
  ApprovalModePicker,
  ModelPicker,
} from './ModelPickers.jsx';
import {
  ChatMessageRow,
  ImagePreviewOverlay,
} from './ChatMessageRow.jsx';
import {
  ChatAgentTimeline,
  ChatTimelineCollapsed,
  ChatTimelineElapsedPill,
} from './ChatTimelineNodes.jsx';

const { useState, useEffect, useRef, useMemo } = React;

export const CHAT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const CHAT_IMAGE_MAX_COUNT = 4;
export const CHAT_IMAGE_ACCEPTED_MIME = new Set([
  'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif',
]);

export function ChatPanel({
  conversationId,
  messages = [],
  running = false,
  disabled = false,
  submitPending = false,
  onSend,
  onStop,
  onSelectFile,
  onClearFile,
  onUploadImage,
  attachment,
  uploading,
  contextUsage,
  workspacePath,
  homePath,
  activeTaskText,
  now,
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
}) {
  const resolvedProviderOptions = Array.isArray(providerOptions) && providerOptions.length > 0
    ? providerOptions
    : [];
  const resolvedAgentOptions = Array.isArray(agentOptions) && agentOptions.length > 0 ? agentOptions : DEFAULT_AGENT_OPTIONS;
  const resolvedDefaultAgentId = defaultAgentId || resolvedAgentOptions[0]?.id || DEFAULT_AGENT_OPTIONS[0].id;
  const [localDraft, setLocalDraft] = React.useState('');
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
  const [composerImages, setComposerImages] = React.useState([]);
  const [previewImage, setPreviewImage] = React.useState(null);
  const closeImagePreview = React.useCallback(() => setPreviewImage(null), []);
  const composerImagesRef = React.useRef([]);
  React.useEffect(() => { composerImagesRef.current = composerImages; }, [composerImages]);
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

  // Clean up blob URLs + reset draft images when switching conversations.
  React.useEffect(() => {
    return () => {
      composerImagesRef.current.forEach((img) => {
        if (img.previewUrl) URL.revokeObjectURL(img.previewUrl);
      });
    };
  }, [conversationId]);
  React.useEffect(() => {
    setComposerImages([]);
  }, [conversationId]);

  async function attachImageFile(file) {
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
    if (composerImagesRef.current.length >= CHAT_IMAGE_MAX_COUNT) {
      console.warn(`Image limit reached (${CHAT_IMAGE_MAX_COUNT})`);
      return;
    }

    const id = `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const previewUrl = URL.createObjectURL(file);
    setComposerImages((prev) => [...prev, { id, file, previewUrl, uploading: true }]);

    try {
      const result = await onUploadImage?.(file);
      if (!result || !result.image_id) {
        throw new Error('Upload response missing image_id');
      }
      setComposerImages((prev) => prev.map((img) =>
        img.id === id
          ? { ...img, uploading: false, imageId: result.image_id, path: result.path, mime: result.mime, sizeBytes: result.size_bytes }
          : img,
      ));
    } catch (error) {
      console.error('Chat image upload failed', error);
      setComposerImages((prev) => prev.map((img) =>
        img.id === id ? { ...img, uploading: false, error: String(error?.message || error) } : img,
      ));
    }
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
      // Fall through to existing path-paste behavior.
      handlePathPaste(event, draft, setDraft, workspacePath, homePath, 5000);
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
  const fileRef = React.useRef(null);
  const suppressSubmitUntilRef = React.useRef(0);
  const historyCursorRef = React.useRef(-1);
  const historySavedDraftRef = React.useRef('');
  const shouldAutoScrollRef = React.useRef(true);
  const lastMessageCountRef = React.useRef(messages.length);
  const lastConversationIdRef = React.useRef(conversationId || null);
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

  function isMessageListNearBottom(el) {
    return el.scrollHeight - el.scrollTop - el.clientHeight <= 48;
  }

  function handleMessageListScroll(event) {
    shouldAutoScrollRef.current = isMessageListNearBottom(event.currentTarget);
  }

  React.useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const normalizedConversationId = conversationId || null;
    if (normalizedConversationId !== lastConversationIdRef.current || messages.length < lastMessageCountRef.current) {
      shouldAutoScrollRef.current = true;
    }
    lastConversationIdRef.current = normalizedConversationId;
    lastMessageCountRef.current = messages.length;
    if (!shouldAutoScrollRef.current) return;
    requestAnimationFrame(() => {
      if (listRef.current) {
        listRef.current.scrollTop = listRef.current.scrollHeight;
      }
    });
  }, [conversationId, messages, running]);

  React.useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, [draft]);

  function restoreActiveTaskText(value = activeTaskText) {
    const text = String(value || '').trim();
    if (!text) return;
    setDraft(text);
    requestAnimationFrame(() => {
      inputRef.current?.focus?.();
      inputRef.current?.setSelectionRange?.(text.length, text.length);
    });
  }

  function stopAndRestore() {
    const restoreText = onStop?.();
    if (restoreText) restoreActiveTaskText(restoreText);
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
    const text = draft.trim();
    if (!text || disabled || submitPending || !providerConfigured) return;
    // Block while any pasted image is still uploading.
    if (imagesUploading) return;
    if (modelLoading || !activeModelOptions.some((o) => o.id === modelId)) return;
    if (!resolvedAgentOptions.some((o) => o.id === effectiveAgentId)) return;
    const readyImages = composerImages
      .filter((img) => img.imageId && !img.error)
      .map((img) => ({
        image_id: img.imageId,
        path: img.path,
        mime: img.mime,
        previewUrl: img.previewUrl || null,
      }));
    onSend?.(text, attachment, modelId, reasoningEffort, readyImages, effectiveAgentId, providerRequest);
    setDraft('');
    onClearFile?.();
    // Ownership of the blob URLs transfers to the rendered chat message; the
    // unmount cleanup at the conversationId boundary will revoke them. Do NOT
    // revoke here, or the just-sent thumbnail goes blank.
    setComposerImages([]);
    if (fileRef.current) fileRef.current.value = '';
  }

  function pickFile() {
    if (!canUploadDocuments || disabled || submitPending) return;
    fileRef.current?.click();
  }

  function clearFile(e) {
    e.stopPropagation();
    onClearFile?.();
    if (fileRef.current) fileRef.current.value = '';
  }

  React.useEffect(() => {
    if (!canUploadDocuments && attachment) onClearFile?.();
  }, [canUploadDocuments, attachment, onClearFile]);

  return (
    <section className="chat-workspace" aria-label="Chat">
      <div ref={listRef} className="chat-message-list" onScroll={handleMessageListScroll}>
        {messages.length === 0 ? (
          <div className="chat-empty">
            <div className="chat-empty-illustration" aria-hidden="true">
              <div className="chat-empty-card chat-empty-card-primary">
                <img src="/assets/ui/empty-state/penguin-relax-card.png" alt="" />
              </div>
              <div className="chat-empty-card chat-empty-card-secondary">
                <img src="/assets/ui/empty-state/penguin-sleepy-card.png" alt="" />
              </div>
            </div>
            <div className="chat-empty-title">What's on your mind?</div>
            <div className="chat-empty-copy">Drop a task, a question, or a loose idea. I'll take it from there.</div>
          </div>
        ) : messages.map((message) => (
          <ChatMessageRow key={message.id} message={message} now={now} onPreviewImage={openImagePreview} />
        ))}
      </div>
      <form
        className="chat-composer"
        onSubmit={submit}
        onDragOver={handleComposerDragOver}
        onDrop={handleComposerDrop}
      >
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
        <textarea
          ref={inputRef}
          rows={1}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onPaste={handleComposerPaste}
          onKeyDown={(event) => {
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
              const el = event.currentTarget;
              if (el.selectionStart !== 0 || el.selectionEnd !== 0) return;
              event.preventDefault();
              const history = userMessageHistory;
              if (history.length === 0) return;
              const cursor = historyCursorRef.current;
              if (cursor === -1) {
                historySavedDraftRef.current = draft;
              }
              const nextCursor = Math.min(cursor + 1, history.length - 1);
              historyCursorRef.current = nextCursor;
              setDraft(history[nextCursor]);
              requestAnimationFrame(() => {
                el.setSelectionRange(history[nextCursor].length, history[nextCursor].length);
              });
              return;
            }
            if (event.key === 'ArrowDown' && !event.shiftKey && !event.nativeEvent.isComposing) {
              const el = event.currentTarget;
              if (el.selectionStart !== el.value.length || el.selectionEnd !== el.value.length) return;
              event.preventDefault();
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
              requestAnimationFrame(() => {
                el.setSelectionRange(history[nextCursor].length, history[nextCursor].length);
              });
              return;
            }
            // Any non-modifier key resets the history cursor.
            if (!['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab'].includes(event.key)) {
              historyCursorRef.current = -1;
            }
          }}
          placeholder={!providerConfigured ? 'Configure an LLM provider in Settings first...' : submitPending ? 'Preparing conversation...' : running ? 'Assistant is currently processing...' : 'Ask, draft, or delegate...'}
          disabled={disabled}
          maxLength={5000}
        />
        <div className="chat-composer-actions">
          <div className="chat-composer-tools">
            {canUploadDocuments ? (
              <>
                <PortalTooltip text="Attach File" position="above">
                  <button
                    type="button"
                    className="chat-tool-btn chat-tool-attach icon-only"
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
                    onSelectFile?.(nextFile);
                  }}
                />
              </>
            ) : null}
            <ApprovalModePicker readOnly={runConfigReadOnly} disabled={runConfigDisabled} />
          </div>
          <div className="chat-composer-submit">
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
              <button type="button" className="chat-send stop" onMouseDown={handleStopPress} onKeyDown={handleStopKey} aria-label={submitPending ? 'Cancel pending request' : 'Stop'}>
                <span className="ico ico-stop" aria-hidden="true" />
              </button>
            ) : (
              <button type="submit" className="chat-send" disabled={disabled || !draft.trim() || !providerConfigured} aria-label="Send">
                <span className="ico ico-deploy" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </form>
      <ImagePreviewOverlay image={previewImage} onClose={closeImagePreview} />
    </section>
  );
}

