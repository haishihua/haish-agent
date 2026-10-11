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
import { CHAT_ROW_WINDOW_INITIAL, CHAT_ROW_WINDOW_TRIGGER_PX, growRowWindow, recallRowWindow, rememberRowWindow, rowWindowCovering, shouldGrowRowWindow, windowRows } from '../model/chat-row-window.js';
import { ScrollToBottomButton } from '../../../shared/ui/ScrollToBottomButton.jsx';
import { LoadingState } from '../../../shared/ui/agent-elements/LoadingState.jsx';
import { ChatComposer } from './ChatComposer.jsx';
// Prefetch execution records as their summary rows approach the viewport.
const EARLIER_TASKS_SCROLL_TRIGGER_PX = 160;

// 一个会话的行组。rows 是某一刻的“活”快照（连批注编号、禁用态、回调一起），整组渲染成
// 一个 flex 列。离开的会话那一组会带着 hidden 留在原地——同一个组件、同一个 key，
// React 按 key 复用 fiber 与 DOM，切回来不再重新解析一遍窗口里的正文（见 keptGroup）。
// 隐藏时用 aria-hidden 把自己从“在会话里查找”的正文扫描里排除。
const ChatRowGroup = React.memo(function ChatRowGroup({ group, hidden = false }) {
  return (
    <div className="chat-row-group" hidden={hidden} aria-hidden={hidden ? 'true' : undefined}
      data-row-group={group.conversationId}>
      {group.rows.map((row) => (row.kind === 'day' ? (
        <ChatDaySeparator key={row.id} label={row.label} />
      ) : (
        <ChatMessageRow
          key={row.id}
          message={row}
          forceTraceOpen={group.forceTraceOpen}
          annotationNumbers={group.annotationNumbers}
          onPreviewImage={group.onPreviewImage}
          onAnnotationJump={group.onAnnotationJump}
          actionsDisabled={group.actionsDisabled}
          onFork={row.role === 'agent' && row.status === 'done' && row.messageId ? group.onForkMessage : null}
          onEdit={row.role === 'user' && row.status === 'cancelled' && row.taskId === group.lastTaskId ? group.onEditMessage : null}
          onRetry={row.role === 'agent' && row.status === 'failed' && row.taskId && row.taskId === group.lastTaskId ? group.onRetryTask : null}
        />
      )))}
    </div>
  );
});

export function ChatPanel({
  conversationId,
  approvalDraft = false,
  ensureApprovalConversation,
  composerScopeId = conversationId,
  messages = [],
  // 会话正文还在路上（判据见 AppShell 的 conversationLoading）：整段会话在正中间用一颗
  // Loader 占位，行等正文到了再一次性铺开。
  loading = false,
  running = false,
  disabled = false,
  submitPending = false,
  onSend,
  onGoalCommand,
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
  agentError = '',
  onAgentRetry,
  agentLocked = false,
  agentLockedReason = '',
  lockedAgentId = '',
  hasSentMessage = false,
  onAgentChange,
  onToast,
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
  const [searchExpandedConversation, setSearchExpandedConversation] = React.useState(null);
  const searchExpanded = searchExpandedConversation === conversationId;
  const searchContextRef = React.useRef(null);
  const handleSearchChange = React.useCallback((active) => {
    const context = searchContextRef.current;
    if (context && (active || context.expanded)) {
      // Keep the searched history mounted after clearing/closing. Shrinking
      // back to the tail would remove the message the reader just found.
      setRowWindow((count) => Math.max(count, context.rowCount));
      if (active) setSearchExpandedConversation(context.conversationId);
    }
    setSearchActive(active);
  }, []);
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
  // 首屏只渲染最近 N 行，向上滚到接近顶部再按页补（见 model/chat-row-window.js）。
  // 全量 listRows 继续喂给批注、「最后一轮才能重试/编辑」这些判据，只有渲染被窗口化。
  const [rowWindow, setRowWindow] = React.useState(CHAT_ROW_WINDOW_INITIAL);
  const [keptGroup, setKeptGroup] = React.useState(null);
  const rowWindowMemoryRef = React.useRef(new Map());
  const liveGroupRef = React.useRef(null);
  const rowAnchorRef = React.useRef(null);
  // 已经排队、还没提交的那一页的目标行数（见 growEarlierRows）。
  const pendingGrowthRef = React.useRef(0);
  // 切会话：把上一个会话当时渲染的那组行留在原地（hidden）。那一组带着窗口里的 DOM 和
  // 已经解析好的正文，切回来直接复用；否则每次切回都要把整个窗口重新解析一遍。
  // 这是“渲染期调整 state”的标准写法：先读上一轮的组、置空引用，再 setState。
  const leavingGroup = liveGroupRef.current;
  if (leavingGroup && leavingGroup.conversationId !== conversationId) {
    liveGroupRef.current = null;
    rememberRowWindow(rowWindowMemoryRef.current, leavingGroup.conversationId, leavingGroup.count);
    setKeptGroup(leavingGroup);
    setRowWindow(recallRowWindow(rowWindowMemoryRef.current, conversationId));
  }
  // 搜索要看到全部正文，窗口在这一刻让位（和窗口化之前一致：搜索不丢历史）。
  const windowedRows = React.useMemo(
    () => (searchActive ? listRows : windowRows(listRows, rowWindow)),
    [listRows, rowWindow, searchActive],
  );
  React.useLayoutEffect(() => {
    searchContextRef.current = { conversationId, rowCount: listRows.length, expanded: searchExpanded };
  }, [conversationId, listRows.length, searchExpanded]);
  // Keep measured history visible after search; restoring content-visibility
  // estimates here would shift the reader even though all rows are retained.
  const retainSearchLayout = searchActive || searchExpanded;
  const hasEarlierRows = !searchActive && windowedRows.length < listRows.length;
  const [annotationNotice, setAnnotationNotice] = React.useState('');
  const annotationUiRef = React.useRef(null);
  // 批注列表拿的是全量批注，但被引用正文所在的行可能落在窗口外（窗口只盖尾部）。
  // 跳转/编辑都要在 DOM 里找到那段原文，所以先把窗口一次补到盖住目标行，提交后再跳；
  // 窗口化之前所有行都在，不存在这一步。
  const pendingAnnotationRef = React.useRef(null);
  const runAnnotationAction = React.useCallback((item, action) => {
    const sourceId = item?.source_message_id;
    const index = listRows.findIndex((row) => row.messageId === sourceId || row.id === sourceId);
    const needed = index >= 0 ? rowWindowCovering(index, listRows.length) : 0;
    if (needed > rowWindow) {
      pendingAnnotationRef.current = () => action(item);
      setRowWindow(needed);
      return;
    }
    action(item);
  }, [listRows, rowWindow]);
  const jumpToAnnotation = React.useCallback((item) => runAnnotationAction(item, (target) => annotationUiRef.current?.jump(target)), [runAnnotationAction]);
  const editAnnotation = React.useCallback((item) => runAnnotationAction(item, (target) => annotationUiRef.current?.edit(target)), [runAnnotationAction]);
  React.useLayoutEffect(() => {
    const pending = pendingAnnotationRef.current;
    if (!pending) return;
    pendingAnnotationRef.current = null;
    pending();
  }, [rowWindow]);
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
  // 重跑和编辑就用哪个，所以这里只记它通报回来的那一份。
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
  // Attempts wait for the current configuration commit, never the source Task's selection.
  const retryMessage = React.useCallback(async (message) => {
    const current = composerRunConfigRef.current;
    if (!current) throw new Error('Wait for the current provider/model configuration before retrying.');
    const saved = await current?.ensureSaved?.();
    return rowActionRef.current.onRetryTask?.(message.taskId, saved ? {
      provider: saved.provider, modelId: saved.model_id, reasoningEffort: saved.reasoning_effort, agentId: saved.agent_id,
    } : null);
  }, []);
  const editMessage = React.useCallback(async (text, message) => {
    const current = composerRunConfigRef.current;
    if (!current?.provider || !current.modelId) {
      throw new Error('Select an available provider and model before resending. Your changes have not been sent.');
    }
    const saved = await current.ensureSaved();
    return rowActionRef.current.onEditMessage?.(message.taskId, text, {
      provider: saved.provider, modelId: saved.model_id, reasoningEffort: saved.reasoning_effort, agentId: saved.agent_id,
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
  // 补页是把行插在现有内容上面：先记住最上面那行相对视口的位置，补完把它放回原处，
  // 正在读的字不会往下跳。贴着底部时不记——自动跟随负责钉住最新一条。
  const captureRowAnchor = React.useCallback(() => {
    const element = listRef.current;
    if (!element || element.scrollHeight - element.scrollTop - element.clientHeight <= 4) return;
    const viewportTop = element.getBoundingClientRect().top;
    // 锚点要取「正在读的那一行」，不是整个行组：组顶远在视口上方，钉住它等于钉住滚动
    // 偏移，补页后读到的字会换一批。留在原地的上一会话行组没有布局盒子，自然被跳过。
    const node = [...element.querySelectorAll('.chat-message-row')]
      .find((row) => row.getClientRects().length && row.getBoundingClientRect().bottom > viewportTop + 1);
    if (node) rowAnchorRef.current = { node, offset: node.getBoundingClientRect().top - viewportTop };
  }, []);
  const growEarlierRows = React.useCallback(() => {
    // 一次滚动可能连发好几个事件（上一页还没提交）：只放一页在路上，其余等提交后再说。
    const target = pendingGrowthRef.current || growRowWindow(rowWindow, listRows.length);
    if (target <= rowWindow) return;
    pendingGrowthRef.current = target;
    captureRowAnchor();
    setRowWindow(target);
  }, [captureRowAnchor, listRows.length, rowWindow]);
  React.useLayoutEffect(() => {
    pendingGrowthRef.current = 0;
  }, [rowWindow]);
  React.useLayoutEffect(() => {
    const anchor = rowAnchorRef.current;
    rowAnchorRef.current = null;
    const element = listRef.current;
    if (!anchor || !element || !anchor.node.isConnected) return;
    const viewportTop = element.getBoundingClientRect().top;
    element.scrollTop += (anchor.node.getBoundingClientRect().top - viewportTop) - anchor.offset;
  }, [rowWindow]);
  React.useLayoutEffect(() => {
    // Loading 占位不是正文：等真实消息挂载后再测高度，避免等待详情时把窗口补到全量。
    if (loading) return;
    const element = listRef.current;
    // 窗口比视口还矮时继续补：内容撑不满就没有滚动条，“滚到顶补一页”永远触发不了。
    if (element && hasEarlierRows && element.scrollHeight <= element.clientHeight + CHAT_ROW_WINDOW_TRIGGER_PX) growEarlierRows();
  }, [loading, hasEarlierRows, windowedRows.length, growEarlierRows]);
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
    const element = listRef.current;
    if (!element) return;
    // 会话还在加载：列表里没有一行可读的内容，补页 / 分页都等正文到了再说。
    if (loading) return;
    // 行窗口：滚到接近列表顶先补一页行，再谈执行记录分页。
    if (hasEarlierRows && shouldGrowRowWindow(element.scrollTop, CHAT_ROW_WINDOW_TRIGGER_PX)) growEarlierRows();
    if (!earlierTaskRuntimesPending || earlierTaskRuntimesLoading || earlierTasksError) return;
    const viewport = element.getBoundingClientRect();
    // 留在原地的上一会话行组是 display:none：它的 [data-trace-pending] 不算可见，
    // 否则会把别的会话的执行记录拉进来。
    const pendingVisible = [...element.querySelectorAll('[data-trace-pending]')].some((row) => {
      if (!row.getClientRects().length) return false;
      const rect = row.getBoundingClientRect();
      return rect.bottom >= viewport.top && rect.top <= viewport.bottom + EARLIER_TASKS_SCROLL_TRIGGER_PX;
    });
    if (searchActive || element.scrollTop <= EARLIER_TASKS_SCROLL_TRIGGER_PX || pendingVisible) loadEarlierTasks();
  }, [hasEarlierRows, growEarlierRows, earlierTaskRuntimesPending, earlierTaskRuntimesLoading, earlierTasksError, searchActive, loadEarlierTasks, loading]);
  React.useEffect(() => {
    // Re-check after each page settles, even if row count/scrollTop did not
    // change. Search needs every page, not just the currently visible steps.
    const frame = requestAnimationFrame(handleListScroll);
    return () => cancelAnimationFrame(frame);
  }, [handleListScroll, messages, conversationId]);
  const liveGroup = React.useMemo(() => ({
    conversationId,
    rows: windowedRows,
    count: rowWindow,
    annotationNumbers,
    forceTraceOpen: searchActive,
    actionsDisabled: running || submitPending,
    lastTaskId: messages.at(-1)?.taskId,
    onForkMessage: forkMessage,
    onRetryTask: retryMessage,
    onEditMessage: editMessage,
    onPreviewImage: openImagePreview,
    onAnnotationJump: jumpToAnnotation,
  }), [conversationId, windowedRows, rowWindow, annotationNumbers, searchActive, running, submitPending, messages, forkMessage, retryMessage, editMessage, openImagePreview, jumpToAnnotation]);
  // 下一次会话切换时，这一份就是被留在原地的那个分组。
  liveGroupRef.current = liveGroup;
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
        <ConversationSearch key={conversationId || 'draft'} scrollRef={listRef} onSearchChange={handleSearchChange}
          loading={earlierTaskRuntimesPending && !earlierTasksError} />
        <div ref={listRef} className={`chat-message-list${retainSearchLayout ? ' is-searching' : ''}`} onScroll={handleListScroll}>
          {!loading && messages.length > 0 && (earlierTaskRuntimesPending || earlierTaskRuntimesLoading) ? (
            <div className="chat-earlier-tasks" role="status">
              {earlierTasksError ? <>{earlierTasksError} <button type="button" onClick={loadEarlierTasks}>Retry loading steps</button></>
                : earlierTaskRuntimesLoading ? 'Loading earlier steps…' : 'Scroll up to load earlier steps'}
            </div>
          ) : null}
          {!loading && hasEarlierRows ? (
            <div className="chat-earlier-rows" role="status">
              <span>Earlier messages load as you scroll up.</span>
              <button type="button" onClick={growEarlierRows}>Load earlier messages</button>
            </div>
          ) : null}
          {keptGroup ? <ChatRowGroup key={keptGroup.conversationId} group={keptGroup} hidden /> : null}
          {loading ? (
            <div className="chat-conversation-loading" role="status">
              <LoadingState label="Loading conversation…" />
            </div>
          ) : messages.length === 0 ? (
            <div className="chat-empty">
              <PenguinCards />
              <div className="chat-empty-title">What's on your mind?</div>
              <div className="chat-empty-copy">Drop a task, a question, or a loose idea. I'll take it from there.</div>
            </div>
          ) : <ChatRowGroup key={liveGroup.conversationId} group={liveGroup} />}
          <ApprovalInline conversationId={conversationId} />
        </div>
        {!loading && messages.length > 0 ? (
          <ScrollToBottomButton scrollRef={listRef} autoFollow={!searchActive} resetKey={`${conversationId || ''}:${sendScrollKey}`} />
        ) : null}
      </div>
      <ChatComposer
        conversationId={conversationId}
        approvalDraft={approvalDraft}
        ensureApprovalConversation={ensureApprovalConversation}
        scopeId={composerScopeId}
        inputRef={composerInputRef}
        draft={draft}
        onDraftChange={setDraft}
        onSend={onSend}
        onGoalCommand={onGoalCommand}
        onToast={onToast}
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
        agentError={agentError}
        onAgentRetry={onAgentRetry}
        agentLocked={agentLocked}
        agentLockedReason={agentLockedReason}
        lockedAgentId={lockedAgentId}
        hasSentMessage={hasSentMessage}
        onAgentChange={onAgentChange}
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
