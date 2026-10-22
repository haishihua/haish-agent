import { forgetDraftConversationId } from '../../model/draft-conversation-id.js';

// 草稿落地：首条发送前把本地空壳换成真会话，并把 runtime / 输入草稿整份交给它。
// isConversationActivationCurrent / clearDraftFirstSendInFlight 来自 draft-lifecycle。
export function createDraftMaterializeHandlers(ctx) {
  const {
    applyConversationSnapshot,
    clearDraftFirstSendInFlight,
    conversationActivationSeqRef,
    conversationId,
    conversationIdRef,
    createConversationInProject,
    draftConversationIdsRef,
    draftConversationRef,
    draftFirstSendRef,
    draftServerCreateRef,
    getRuntime,
    isConversationActivationCurrent,
    pendingCreatedDetailRef,
    rekeyChatDraft,
    runtimesRef,
    setConversationId,
    setStoredConversationId,
    setWorkspaceState,
    viewModeRef,
    workspaceState,
    workspaceStateWithConversationDetail,
  } = ctx;

  async function ensureServerConversationForActiveDraft() {
    const draft = draftConversationRef.current;
    if (!draft?.id) return null;

    if (pendingCreatedDetailRef.current?.conversation_id) {
      return pendingCreatedDetailRef.current;
    }

    // 同一个草稿只允许一次建会话：连按发送 / 选完文件立刻发送 / 排队重发可能同时
    // 进来，第二次必须等第一次的结果。各建一条的话，多出来的那条没有 runtime
    // （交接只会发生在这一条上），首条消息就会撞 "conversation runtime is missing"，
    // 服务端还会多一条空会话。
    const inFlight = draftServerCreateRef.current;
    if (inFlight?.draftId === draft.id) return inFlight.request;

    // Already switched onto a real conversation id that belongs to this draft.
    if (conversationIdRef.current && conversationIdRef.current !== draft.id) {
      return null;
    }

    const project = workspaceState.projects.find((item) => item.id === draft.projectId)
      || {
        id: draft.projectId,
        workspacePath: draft.workspacePath,
        workspaceLabel: draft.workspaceLabel,
      };
    const activationSeq = conversationActivationSeqRef.current;
    const request = (async () => {
      // Automatic shells must use the backend default title. Sending a local
      // placeholder as `title` would mark it as a user rename and disable titling.
      const detail = await createConversationInProject(
        project,
        undefined,
        draft.executionMode || (viewModeRef.current === 'chat' ? 'chat' : 'bot'),
      );
      const stillSelected = isConversationActivationCurrent(activationSeq)
        && draftConversationRef.current === draft
        && conversationIdRef.current === draft.id;

      const previousDraftId = draft.id;
      const realId = detail.conversation_id;
      // 交接是"补齐"而不是"搬走"：草稿 runtime 可能已经先被回收（切会话 / 再点 + /
      // 404 收敛 / 上一次建会话的迟到回调），只在存在时搬会让真会话永远没有 runtime，
      // 首条消息必然失败。真会话没有就补一块空的，有就整份接过来。
      const previousRuntime = getRuntime(previousDraftId);
      if (previousDraftId !== realId) {
        const realRuntime = getRuntime(realId, { create: true });
        if (previousRuntime && realRuntime) Object.assign(realRuntime, previousRuntime);
        runtimesRef.current.delete(previousDraftId);
      }

      rekeyChatDraft?.(previousDraftId, realId);
      // Runtime ownership always transfers; display ownership only transfers
      // if the user has not navigated since creation started.
      if (stillSelected) {
        pendingCreatedDetailRef.current = detail;
        draftConversationRef.current = {
          ...draft,
          id: realId,
          localDraftId: previousDraftId,
          serverCreated: true,
        };
        conversationIdRef.current = realId;
        setConversationId(realId);
        // Still withhold from storage/sidebar until the first user message is sent.
        setStoredConversationId(null);
        applyConversationSnapshot(detail);
      }
      return detail;
    })();
    draftServerCreateRef.current = { draftId: draft.id, request };
    try {
      return await request;
    } finally {
      if (draftServerCreateRef.current?.request === request) {
        draftServerCreateRef.current = null;
      }
    }
  }

  async function materializeDraftConversationForSend() {
    const draft = draftConversationRef.current;
    if (!draft) {
      const existingId = conversationIdRef.current || conversationId || null;
      return existingId ? { id: existingId, detail: null } : null;
    }
    // 这一笔发送已经接下、还没落地（同步设上，handleDeploy 靠它挡住第二次提交）。
    draftFirstSendRef.current = draft.id;
    // A later '+' in the same project must not reuse this in-flight runtime.
    forgetDraftConversationId(draftConversationIdsRef.current, draft.projectId);
    const activationSeq = conversationActivationSeqRef.current;
    try {
      let detail = pendingCreatedDetailRef.current;
      if (!detail?.conversation_id) {
        detail = await ensureServerConversationForActiveDraft();
      }
      // An attachment may have created this shell before the first send. Do not
      // PATCH its title: the backend first-task path owns the persisted placeholder.
      if (!detail?.conversation_id) {
        throw new Error('conversation create failed');
      }
      if (detail.project_id !== draft.projectId) {
        throw new Error('draft conversation project mismatch');
      }

      const realId = detail.conversation_id;
      const previousDraftId = draft.id;
      // The draft is real now: the next "new conversation" in this project starts
      // from a fresh id (and a fresh, empty composer).
      const stillSelected = isConversationActivationCurrent(activationSeq)
        && conversationIdRef.current === realId
        && draftConversationRef.current?.id === realId;
      setWorkspaceState((state) => workspaceStateWithConversationDetail(state, detail, stillSelected));
      rekeyChatDraft?.(previousDraftId, realId);
      if (stillSelected) {
        setStoredConversationId(realId);
        conversationIdRef.current = realId;
        setConversationId(realId);
        applyConversationSnapshot(detail);
        draftConversationRef.current = null;
        pendingCreatedDetailRef.current = null;
      }
      // Return detail so startDeploy can seed the list entry even if React has not
      // flushed the setWorkspaceState above yet.
      return { id: realId, detail };
    } finally {
      // 落地或失败都释放：第二次提交从这一刻起回到正常路径。
      clearDraftFirstSendInFlight(draft.id);
    }
  }

  return {
    ensureServerConversationForActiveDraft,
    materializeDraftConversationForSend,
  };
}
