import {
  forgetDraftConversationId,
  rememberDraftConversationId,
} from '../../model/draft-conversation-id.js';

// 草稿的生命周期：新建空壳、识别草稿、标记「要留着」、回收。
export function createDraftLifecycleHandlers(ctx) {
  const {
    API_BASE,
    DEFAULT_SESSION_NAME,
    apiFetch,
    conversationActivationSeqRef,
    conversationDetailAbortRef,
    conversationIdRef,
    createDefaultProject,
    createEmptyTaskRuntimeState,
    detachActiveRunFromCurrentConversation,
    draftConversationIdsRef,
    draftConversationRef,
    draftFirstSendRef,
    flushRuntimeTasksToWorkspace,
    generateHexId,
    mutateRuntime,
    normalizeWorkspaceOrdering,
    pendingCreatedDetailRef,
    rekeyChatDraft,
    resetContextUsage,
    runtimesRef,
    setComposerAttachment,
    setConversationAttachments,
    setConversationError,
    setConversationId,
    setConversationReady,
    setLocalWorkspace,
    setStoredConversationId,
    setUploadState,
    setWorkspaceState,
    viewModeRef,
    workspaceState,
  } = ctx;

  function invalidateConversationActivation() {
    conversationActivationSeqRef.current += 1;
    return conversationActivationSeqRef.current;
  }

  function isConversationActivationCurrent(seq) {
    return conversationActivationSeqRef.current === seq;
  }

  function isDraftConversationId(conversationIdValue) {
    return Boolean(
      conversationIdValue
      && draftConversationRef.current
      && draftConversationRef.current.id === conversationIdValue
    );
  }

  // 传过文件之后这个草稿就是用户的真实内容了——解析成功、失败都算：文件已经落在服务端
  // （成功的还会留下附件与导入记录），把它当空壳回收等于连用户的东西一起扔掉。
  // 标记之后有两件事跟着变：切走不再删这条会话；已经打好的字留在它自己的输入框里，
  // 下次打开这条会话还能接着发（而不是退回 "+" 那个空壳）。
  function markDraftConversationKept(conversationId) {
    const draft = draftConversationRef.current;
    if (!draft || (conversationId && draft.id !== conversationId)) return;
    draft.keepServerConversation = true;
  }

  // 草稿上已经挂着一笔还没落地的首条发送（staged pendingTask / 正在跑 / 已经开了流）。
  // 这时候 runtime 和空壳会话都不能回收：materialize 出来的真会话要认领这份 runtime，
  // 回收掉首条消息就会撞上 "conversation runtime is missing"。
  function draftConversationHasSendInFlight(conversationIdValue) {
    if (!conversationIdValue) return false;
    const runtime = runtimesRef.current.get(conversationIdValue);
    if (!runtime) return false;
    return Boolean(
      runtime.taskRuntimeState?.pendingTask
      || runtime.busy
      || runtime.activeRunId,
    );
  }

  // 首条发送的占用标记（一次只认一个草稿）：handleDeploy 用它挡住"第一条还在建
  // 会话时又发第二条"，materialize 收尾（成功或失败）后释放。
  function markDraftFirstSendInFlight(conversationIdValue) {
    if (conversationIdValue) draftFirstSendRef.current = conversationIdValue;
  }

  function clearDraftFirstSendInFlight(conversationIdValue) {
    if (!conversationIdValue || draftFirstSendRef.current === conversationIdValue) {
      draftFirstSendRef.current = null;
    }
  }

  function isDraftFirstSendInFlight(conversationIdValue) {
    return Boolean(conversationIdValue && draftFirstSendRef.current === conversationIdValue);
  }

  function clearDraftConversationState({ clearComposer = true } = {}) {
    const draft = draftConversationRef.current;
    const pendingDetail = pendingCreatedDetailRef.current;
    const keepServerConversation = Boolean(draft?.keepServerConversation);
    const sendInFlight = draftConversationHasSendInFlight(draft?.id);
    if (draft?.id && !sendInFlight) {
      runtimesRef.current.delete(draft.id);
    }
    // A draft that already forced a server create (document upload) holds its
    // unsent text under the server id. Put it back on the remembered draft id so
    // re-opening the blank chat restores what the user typed — unless the draft
    // itself stays as a real conversation (see markDraftConversationKept), in
    // which case the text belongs to that conversation.
    if (!keepServerConversation && draft?.localDraftId && draft.localDraftId !== draft.id) {
      rekeyChatDraft?.(draft.id, draft.localDraftId);
    }
    // If a draft already forced a server create but the user never sent a message
    // and never attached a file, drop that empty shell so it cannot reappear
    // after a later workspace refresh. 传过文件的会话不删（见上）。
    const pendingServerId = pendingDetail?.conversation_id
      || (draft?.serverCreated ? draft.id : null);
    if (!keepServerConversation && !sendInFlight && pendingServerId && !String(pendingServerId).startsWith('draft-')) {
      apiFetch(`${API_BASE}/api/conversations/${encodeURIComponent(pendingServerId)}`, {
        method: 'DELETE',
      }).catch(() => {});
      runtimesRef.current.delete(pendingServerId);
    }
    // 会话留下了，"新建会话" 就得换一个新壳：文字和附件都归那条真会话。
    if (keepServerConversation) {
      forgetDraftConversationId(draftConversationIdsRef.current, draft?.projectId);
    }
    draftConversationRef.current = null;
    pendingCreatedDetailRef.current = null;
    if (clearComposer) {
      setComposerAttachment(null);
      setUploadState({ active: false, fileName: '' });
    }
  }

  function openDraftConversation(projectId) {
    const requestSeq = invalidateConversationActivation();
    conversationDetailAbortRef.current?.abort?.();
    conversationDetailAbortRef.current = null;

    const project = workspaceState.projects.find((item) => item.id === projectId)
      || workspaceState.projects[0]
      || createDefaultProject();
    const executionMode = viewModeRef.current === 'chat' ? 'chat' : 'bot';
    const previousId = conversationIdRef.current;
    const previousDraftId = draftConversationRef.current?.id || null;
    if (previousId) flushRuntimeTasksToWorkspace(previousId);
    if (previousId && previousId !== previousDraftId) {
      detachActiveRunFromCurrentConversation();
    }
    // Drop any previous unsent draft so repeated "+" clicks do not leak runtimes.
    // 首条消息在途时例外：那一笔还要把这份 runtime 交给服务端真会话。
    if (previousDraftId && !draftConversationHasSendInFlight(previousDraftId)) {
      runtimesRef.current.delete(previousDraftId);
    }
    draftConversationRef.current = null;
    pendingCreatedDetailRef.current = null;
    // 新开一张空白对话：上一笔首条发送的占用标记到此为止。
    draftFirstSendRef.current = null;

    // Stable per project: leaving the draft and opening a new conversation again
    // must land on the same id, or the unsent text stored under it is orphaned.
    const draftId = rememberDraftConversationId(
      draftConversationIdsRef.current,
      project.id,
      generateHexId,
    );
    const now = Date.now();
    draftConversationRef.current = {
      id: draftId,
      composerScopeId: `draft-project:${project.id}`,
      projectId: project.id,
      workspacePath: project.workspacePath || null,
      workspaceLabel: project.workspaceLabel || project.name || null,
      executionMode,
      name: project.type === 'system' ? DEFAULT_SESSION_NAME : 'New Conversation',
      createdAt: now,
    };

    conversationIdRef.current = draftId;
    setConversationId(draftId);
    // Drafts are local-only; do not persist a fake id into storage.
    setStoredConversationId(null);
    setConversationAttachments([]);
    setLocalWorkspace({
      path: project.workspacePath || window.haish?.homePath || null,
      label: project.workspaceLabel || project.name || null,
    });
    // 新会话没有读数：换一块空表盘（不写存储，历史会话的读数不受影响）。
    resetContextUsage();
    setComposerAttachment(null);
    setUploadState({ active: false, fileName: '' });
    setConversationError('');
    setConversationReady(true);

    mutateRuntime(draftId, (rt) => {
      rt.taskRuntimeState = createEmptyTaskRuntimeState();
      rt.busy = false;
      rt.activeRunId = null;
      rt.activeTaskId = null;
      rt.fetchController = null;
      rt.answerBuffer = '';
      rt.cancelledRunIds = new Set();
      rt.abortRequested = false;
      // Local drafts have a complete, empty history; they are not directory
      // summary shells waiting for hydration. Keep this body-ready state when
      // the runtime is handed to the server id, including first-image uploads.
      rt.shellSeeded = false;
    });

    setWorkspaceState((state) => normalizeWorkspaceOrdering({
      ...state,
      activeProjectId: project.id,
      // Keep sidebar selection empty while the draft has no first message.
      activeConversationId: null,
      projects: state.projects.map((item) => (
        item.id === project.id
          ? { ...item, userExpanded: true }
          : item
      )),
    }));

    return isConversationActivationCurrent(requestSeq) ? draftId : null;
  }

  return {
    invalidateConversationActivation,
    isConversationActivationCurrent,
    isDraftConversationId,
    clearDraftConversationState,
    openDraftConversation,
    markDraftConversationKept,
    markDraftFirstSendInFlight,
    clearDraftFirstSendInFlight,
    isDraftFirstSendInFlight,
  };
}
