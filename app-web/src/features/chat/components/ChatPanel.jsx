import React from 'react';
import { PenguinCards } from './PenguinCards.jsx';
import { ConversationSearch } from './ConversationSearch.jsx';
import { MessageAnnotations } from './MessageAnnotations.jsx';
import { QuoteBlock } from '../../../shared/ui/agent-elements/Quote.jsx';
import { useAnnotationDraft } from '../hooks/useAnnotationDraft.js';
import { annotationError, createAnnotationMessageSelector, isSubmittedAnnotationMessage, numberAnnotations, visibleAnnotationDrafts } from '../model/message-annotations.js';
import { ApprovalInline } from '../../approvals/components/ApprovalOverlay.jsx';
import {
  ChatMessageRow,
  ImagePreviewOverlay,
} from './ChatMessageRow.jsx';
import { ChatDaySeparator } from './DaySeparator.jsx';
import { withDaySeparators } from '../model/day-separators.js';
import { ScrollToBottomButton } from '../../../shared/ui/ScrollToBottomButton.jsx';
import { ChatComposer } from './ChatComposer.jsx';
// Prefetch execution records as their summary rows approach the viewport.
const EARLIER_TASKS_SCROLL_TRIGGER_PX = 160;

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
  onForkMessage,
  onEditMessage,
  onLoadEarlierTasks,
  earlierTaskRuntimesPending = false,
}) {
  const [localDraft, setLocalDraft] = React.useState('');
  const [searchActive, setSearchActive] = React.useState(false);
  const [sendScrollKey, setSendScrollKey] = React.useState(0);
  const draft = draftProp !== undefined ? draftProp : localDraft;
  const setDraft = draftProp !== undefined ? onDraftChangeProp : setLocalDraft;
  const selectAnnotationMessages = React.useMemo(() => createAnnotationMessageSelector(), []);
  const annotationMessages = selectAnnotationMessages(messages, conversationId);
  const { items: annotationSnapshots, update: updateAnnotations, storageError } = useAnnotationDraft(conversationId, annotationMessages);
  const annotationDrafts = React.useMemo(() => visibleAnnotationDrafts(annotationSnapshots, annotationMessages), [annotationSnapshots, annotationMessages]);
  // Conversation-scoped: a marker, its composer draft and the sent quote share one number.
  const annotationNumbers = React.useMemo(() => numberAnnotations(annotationMessages, annotationDrafts), [annotationMessages, annotationDrafts]);
  // 会话详情里的日期头：只在消息自身的 created_at 跨天处出现（见 model/day-separators.js）。
  // 只给渲染用——批注、↑ 历史回填、「最后一轮才能重试/编辑」这些判据继续拿原样的 messages。
  const listRows = React.useMemo(() => withDaySeparators(messages), [messages]);
  const [annotationNotice, setAnnotationNotice] = React.useState('');
  const annotationUiRef = React.useRef(null);
  const jumpToAnnotation = React.useCallback((item) => annotationUiRef.current?.jump(item), []);
  const editAnnotation = React.useCallback((item) => annotationUiRef.current?.edit(item), []);
  const saveAnnotation = (item) => {
    const exists = annotationSnapshots.some((draft) => draft.id === item.id);
    const next = exists ? annotationSnapshots.map((draft) => draft.id === item.id ? item : draft) : [...annotationSnapshots, item];
    const error = annotationError(next);
    setAnnotationNotice(error);
    if (error) return false;
    updateAnnotations((previous) => previous.some((draft) => draft.id === item.id)
      ? previous.map((draft) => draft.id === item.id ? item : draft)
      : [...previous, item]);
    return true;
  };
  const highlightedAnnotations = React.useMemo(() => [
    ...annotationMessages.filter(isSubmittedAnnotationMessage).flatMap((m) => (m.annotations || [])
      .map((item) => ({ item, index: annotationNumbers.get(item.id), key: `${m.messageId || m.id}:${item.id}` }))),
    ...annotationDrafts.map((item) => ({ item, index: annotationNumbers.get(item.id), key: `draft:${item.id}` })),
  ], [annotationMessages, annotationDrafts, annotationNumbers]);
  React.useEffect(() => setAnnotationNotice(''), [conversationId]);

  // Collect user messages for ArrowUp history navigation (most recent first).
  const userMessageHistory = React.useMemo(() => {
    return messages
      .filter((m) => m.role === 'user' && typeof m.text === 'string' && m.text.trim().length > 0)
      .map((m) => m.text)
      .reverse();
  }, [messages]);

  // run config（provider/model/reasoning）现在由 ChatComposer 持有——它选哪个模型，
  // 重发和编辑就用哪个，所以这里只记它通报回来的那一份。
  const composerRunConfigRef = React.useRef(null);
  const handleComposerRunConfig = React.useCallback((config) => {
    composerRunConfigRef.current = config;
  }, []);

  // AppShell's handler factories return fresh functions on each stream batch.
  // Stable row callbacks dispatch to the latest *committed* handlers/config.
  const rowActionRef = React.useRef(null);
  React.useLayoutEffect(() => {
    rowActionRef.current = { onForkMessage, onRetryTask, onEditMessage };
  });
  const forkMessage = React.useCallback((message) => rowActionRef.current.onForkMessage?.(message), []);
  const retryMessage = React.useCallback((message) => rowActionRef.current.onRetryTask?.(message.taskId), []);
  const editMessage = React.useCallback((text, message) => {
    const current = composerRunConfigRef.current;
    if (!current?.provider || !current.modelId) {
      throw new Error('Select an available provider and model before resending. Your changes have not been sent.');
    }
    return rowActionRef.current.onEditMessage?.(message.taskId, text, {
      provider: current.provider, modelId: current.modelId, reasoningEffort: current.reasoningEffort,
    });
  }, []);

  // 批注校验要赶在送出发文之前跑，并把批注快照一起交给 onSend。
  const prepareSubmit = (submittedText) => {
    const commentsError = annotationDrafts.length ? annotationError(annotationDrafts, submittedText) : '';
    setAnnotationNotice(commentsError);
    return { error: commentsError, annotations: annotationDrafts };
  };

  const [previewImage, setPreviewImage] = React.useState(null);
  const closeImagePreview = React.useCallback(() => setPreviewImage(null), []);
  const openImagePreview = React.useCallback((image) => {
    const src = image?.src || image?.previewUrl || image?.path || '';
    if (!src) return;
    setPreviewImage({
      src,
      title: image?.title || image?.name || image?.path || 'image',
    });
  }, []);

  const listRef = React.useRef(null);
  const [earlierTasksState, setEarlierTasksState] = React.useState(null);
  const earlierTasksLoadRef = React.useRef(null);
  const earlierTasksContextRef = React.useRef(null);
  React.useLayoutEffect(() => {
    if (earlierTasksContextRef.current?.conversationId !== conversationId) {
      earlierTasksLoadRef.current = null;
      setEarlierTasksState(null);
    }
    earlierTasksContextRef.current = { conversationId, onLoadEarlierTasks };
  }, [conversationId, onLoadEarlierTasks]);
  const earlierTaskRuntimesLoading = earlierTasksState?.conversationId === conversationId && earlierTasksState?.loading;
  const earlierTasksError = earlierTasksState?.conversationId === conversationId ? earlierTasksState?.error : '';
  const loadEarlierTasks = React.useCallback(async () => {
    const context = earlierTasksContextRef.current;
    if (!context.onLoadEarlierTasks || earlierTasksLoadRef.current?.conversationId === context.conversationId) return;
    const request = { conversationId: context.conversationId, loading: true, error: '' };
    earlierTasksLoadRef.current = request;
    setEarlierTasksState(request);
    let error = '';
    try {
      await context.onLoadEarlierTasks(context.conversationId);
    } catch {
      error = 'Could not load earlier steps.';
    } finally {
      // A slow request from a previous conversation must not clear a newer one.
      if (earlierTasksLoadRef.current === request) {
        earlierTasksLoadRef.current = null;
        setEarlierTasksState({ ...request, loading: false, error });
      }
    }
  }, []);
  const handleListScroll = React.useCallback(() => {
    if (!earlierTaskRuntimesPending || earlierTaskRuntimesLoading || earlierTasksError) return;
    const element = listRef.current;
    if (!element) return;
    const viewport = element.getBoundingClientRect();
    const pendingVisible = [...element.querySelectorAll('[data-trace-pending]')].some((row) => {
      const rect = row.getBoundingClientRect();
      return rect.bottom >= viewport.top && rect.top <= viewport.bottom + EARLIER_TASKS_SCROLL_TRIGGER_PX;
    });
    if (searchActive || element.scrollTop <= EARLIER_TASKS_SCROLL_TRIGGER_PX || pendingVisible) loadEarlierTasks();
  }, [earlierTaskRuntimesPending, earlierTaskRuntimesLoading, earlierTasksError, searchActive, loadEarlierTasks]);
  React.useEffect(() => {
    // Re-check after each page settles, even if row count/scrollTop did not
    // change. Search needs every page, not just the currently visible steps.
    const frame = requestAnimationFrame(handleListScroll);
    return () => cancelAnimationFrame(frame);
  }, [handleListScroll, messages, conversationId]);
  const composerInputRef = React.useRef(null);
  // 保存批注后把光标交回输入框：FloatingFocusManager 的 returnFocus 只在“焦点没被
  // 移走”时才还原，所以先同步聚焦一次，下一帧再兜一次，避免被它抢回去。
  const focusComposerInput = React.useCallback(() => {
    composerInputRef.current?.focusAtEnd?.();
    requestAnimationFrame(() => composerInputRef.current?.focusAtEnd?.());
  }, []);

  return (
    <section className="chat-workspace" aria-label="Chat">
      <div className="chat-message-region">
        <ConversationSearch key={conversationId || 'draft'} scrollRef={listRef} onSearchChange={setSearchActive}
          loading={earlierTaskRuntimesPending && !earlierTasksError} />
        <div ref={listRef} className={`chat-message-list${searchActive ? ' is-searching' : ''}`} onScroll={handleListScroll}>
          {messages.length > 0 && (earlierTaskRuntimesPending || earlierTaskRuntimesLoading) ? (
            <div className="chat-earlier-tasks" role="status">
              {earlierTasksError ? <>{earlierTasksError} <button type="button" onClick={loadEarlierTasks}>Retry loading steps</button></>
                : earlierTaskRuntimesLoading ? 'Loading earlier steps…' : 'Scroll up to load earlier steps'}
            </div>
          ) : null}
          {messages.length === 0 ? (
            <div className="chat-empty">
              <PenguinCards />
              <div className="chat-empty-title">What's on your mind?</div>
              <div className="chat-empty-copy">Drop a task, a question, or a loose idea. I'll take it from there.</div>
            </div>
          ) : listRows.map((row) => (
            row.kind === 'day' ? (
              <ChatDaySeparator key={row.id} label={row.label} />
            ) : (
            <ChatMessageRow
              key={row.id}
              message={row}
              forceTraceOpen={searchActive}
              annotationNumbers={annotationNumbers}
              onPreviewImage={openImagePreview}
              onAnnotationJump={jumpToAnnotation}
              actionsDisabled={running || submitPending}
              onFork={row.role === 'agent' && row.status === 'done' && row.messageId
                ? forkMessage : null}
              onEdit={row.role === 'user' && row.status === 'cancelled' && row.taskId === messages.at(-1)?.taskId
                ? editMessage : null}
              onRetry={row.role === 'agent' && row.status === 'failed' && row.taskId && row.taskId === messages.at(-1)?.taskId
                ? retryMessage
                : null}
            />
            )
          ))}
          <ApprovalInline />
        </div>
        {messages.length > 0 ? (
          <ScrollToBottomButton scrollRef={listRef} autoFollow={!searchActive} resetKey={`${conversationId || ''}:${sendScrollKey}`} />
        ) : null}
      </div>
      <ChatComposer
        scopeId={composerScopeId}
        inputRef={composerInputRef}
        draft={draft}
        onDraftChange={setDraft}
        onSend={onSend}
        onStop={onStop}
        onSent={() => setSendScrollKey((value) => value + 1)}
        activeTaskText={activeTaskText}
        running={running}
        disabled={disabled}
        submitPending={submitPending}
        prepareSubmit={prepareSubmit}
        pendingCommentCount={annotationDrafts.length}
        beforeInput={<>
          {annotationDrafts.length > 0 && <div className="haish-annotation-drafts" aria-label="Comment drafts">
            {annotationDrafts.map((item) => <QuoteBlock key={item.id} item={item} index={annotationNumbers.get(item.id)} preview
              onJump={jumpToAnnotation} onEdit={editAnnotation}
              onRemove={() => updateAnnotations((previous) => previous.filter((draft) => draft.id !== item.id))} />)}
          </div>}
          {(annotationNotice || storageError) && <p className="haish-annotation-notice" role="status">{annotationNotice || storageError}</p>}
          {running && annotationDrafts.length > 0 && <p className="haish-annotation-notice">Comments are saved as a draft. Send after the task finishes or stops.</p>}
        </>}
        attachment={attachment}
        uploading={uploading}
        onSelectFile={onSelectFile}
        onClearFile={onClearFile}
        imageStore={imageDrafts}
        onPreviewImage={openImagePreview}
        history={userMessageHistory}
        providerOptions={providerOptions}
        agentOptions={agentOptions}
        defaultAgentId={defaultAgentId}
        agentLoading={agentLoading}
        agentLocked={agentLocked}
        agentLockedReason={agentLockedReason}
        lockedAgentId={lockedAgentId}
        selectionStorageKey={selectionStorageKey}
        onRunConfigChange={handleComposerRunConfig}
        contextUsage={contextUsage}
      />
      <MessageAnnotations key={conversationId || 'draft'} ref={annotationUiRef} listRef={listRef}
        items={highlightedAnnotations} drafts={annotationDrafts} onSave={saveAnnotation} onSaved={focusComposerInput} onError={setAnnotationNotice} />
      <ImagePreviewOverlay image={previewImage} onClose={closeImagePreview} />
    </section>
  );
}
