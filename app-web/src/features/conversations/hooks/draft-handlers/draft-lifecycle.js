import {
  forgetDraftConversationId,
  rememberDraftConversationId,
} from '../../model/draft-conversation-id.js';

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
    draftServerCreateRef,
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
      forgetDraftConversationId(draftConversationIdsRef.current, draft?.projectId, draft?.localDraftId || draft?.id);
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

    // 项目必须跟当前模式同一个：两个模式的项目共用一个 id 空间，从隔壁模式
    // 的 activeProjectId 开出来的草稿会在首条消息上撞执行模式不匹配。
    // 只有工作区里根本没有本模式的项目（缺执行模式的老数据 / 空目录）时，才退回原来的取法。
    const executionMode = viewModeRef.current === 'chat' ? 'chat' : 'bot';
    const modeProjects = workspaceState.projects.filter((item) => item.executionMode === executionMode);
    const project = modeProjects.find((item) => item.id === projectId)
      || modeProjects[0]
      || workspaceState.projects.find((item) => item.id === projectId)
      || workspaceState.projects[0]
      || createDefaultProject(executionMode);
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

  function switchDraftProject(projectOrId) {
    const draft = draftConversationRef.current;
    const project = typeof projectOrId === 'object' && projectOrId?.id
      ? projectOrId : workspaceState.projects.find((item) => item.id === projectOrId);
    if (!draft || draft.executionMode !== 'chat' || draft.id !== conversationIdRef.current || !project || project.executionMode !== 'chat'
      || draft.serverCreated || pendingCreatedDetailRef.current || draftServerCreateRef?.current
      || draftFirstSendRef.current || draftConversationHasSendInFlight(draft.id)) return false;
    if (project.id === draft.projectId) return true;
    const existingDraftId = draftConversationIdsRef.current.get(project.id);
    forgetDraftConversationId(draftConversationIdsRef.current, draft.projectId, draft.id);
    if (!existingDraftId || existingDraftId === draft.id) draftConversationIdsRef.current.set(project.id, draft.id);
    draftConversationRef.current = {
      ...draft, projectId: project.id, workspacePath: project.workspacePath || null,
      workspaceLabel: project.workspaceLabel || project.name || null,
    };
    setLocalWorkspace({ path: project.workspacePath || window.haish?.homePath || null,
      label: project.workspaceLabel || project.name || null });
    setWorkspaceState((state) => normalizeWorkspaceOrdering({ ...state, activeProjectId: project.id, activeConversationId: null }));
    return true;
  }

  return {
    invalidateConversationActivation,
    isConversationActivationCurrent,
    isDraftConversationId,
    clearDraftConversationState,
    openDraftConversation,
    switchDraftProject,
    markDraftConversationKept,
    markDraftFirstSendInFlight,
    clearDraftFirstSendInFlight,
    isDraftFirstSendInFlight,
  };
}
