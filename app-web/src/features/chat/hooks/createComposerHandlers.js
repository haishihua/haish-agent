import { isLocalDraftConversationId } from '../model/local-draft-conversation.js';

export function createComposerHandlers(ctx) {
  const {
    API_BASE,
    applyConversationSnapshot,
    apiFetch,
    conversationActivationSeqRef,
    conversationId,
    conversationIdRef,
    draftConversationRef,
    ensureServerConversationForActiveDraft,
    getRuntime,
    isDraftConversationId,
    markDraftConversationKept,
    mutateRuntime,
    setComposerAttachment,
    setRuntimeFetchController,
    setUploadState,
    showToast,
    viewMode,
    viewModeRef,
  } = ctx;

  async function uploadAttachment(file, signal, targetConversationId = conversationId, capability = {}) {
    if (!file || !targetConversationId) return null;
    const formData = new FormData();
    formData.append('conversation_id', targetConversationId);
    if (capability.agentId) formData.append('agent_id', capability.agentId);
    if (capability.workflowId) formData.append('workflow_id', capability.workflowId);
    formData.append('file', file);
    const response = await apiFetch(`${API_BASE}/api/documents/upload`, {
      method: 'POST',
      body: formData,
      signal,
    });
    if (!response.ok) {
      throw new Error(`upload failed: ${response.status}`);
    }
    return response.json();
  }

  async function uploadChatImage(file, signal, targetConversationId = conversationIdRef.current || conversationId) {
    const resolvedConversationId = targetConversationId;
    if (!file || !resolvedConversationId || isLocalDraftConversationId(resolvedConversationId)) {
      throw new Error('No active conversation.');
    }
    const formData = new FormData();
    formData.append('conversation_id', resolvedConversationId);
    formData.append('file', file);
    const response = await apiFetch(`${API_BASE}/api/messages/images`, {
      method: 'POST',
      body: formData,
      signal,
    });
    if (!response.ok) {
      let detail = '';
      try {
        const payload = await response.json();
        detail = String(payload?.detail || '');
      } catch {
        detail = '';
      }
      throw new Error(detail || `image upload failed: ${response.status}`);
    }
    return response.json();
  }

  async function handleAttachmentSelect(file, selectionId, executionMode = viewModeRef.current || viewMode) {
    const activationSeq = conversationActivationSeqRef.current;
    let targetConversationId = conversationIdRef.current || conversationId;
    // 这里两个判据都要：isDraftConversationId 认的是「当前这条草稿记录」（materialize
    // 之后它的 id 已经是真会话 id，所以这一步只会在还没落地时命中），而本地 id 形态
    // 兜住切走之后仍留在 conversationIdRef 里的旧草稿 id。任一个成立都得先建会话。
    if (file && draftConversationRef.current && (
      !targetConversationId
      || isDraftConversationId(targetConversationId)
      || isLocalDraftConversationId(targetConversationId)
    )) {
      try {
        const detail = await ensureServerConversationForActiveDraft();
        targetConversationId = detail?.conversation_id || conversationIdRef.current || targetConversationId;
      } catch (error) {
        console.error('draft conversation create failed', error);
        if (conversationActivationSeqRef.current === activationSeq) showToast('error', String(error?.message || error));
        return;
      }
    }
    if (conversationActivationSeqRef.current !== activationSeq) return;
    if (!file || !targetConversationId || isLocalDraftConversationId(targetConversationId)) return;
    // 选文件 = 这条会话已经有用户的真实内容：解析成功、失败都算，切走时不能被当成空壳
    // 回收（见 createDraftConversationHandlers 的 markDraftConversationKept）。先落标记
    // 再发请求，上传被取消 / 报错也不会把这条会话弄丢。
    markDraftConversationKept?.(targetConversationId);
    const uploadController = new AbortController();
    mutateRuntime(targetConversationId, (rt) => {
      rt.abortRequested = false;
      // Stop clears the transport slot synchronously. Display ownership must
      // survive that release so this upload can still unlock its own composer.
      rt.composerUploadController = uploadController;
    });
    setRuntimeFetchController(uploadController, targetConversationId);
    // Runtime and display ownership are separate; neither grants ownership of
    // a newer upload in the same conversation (including A → B → A).
    const ownsRuntime = () => getRuntime(targetConversationId)?.fetchController === uploadController;
    const ownsDisplay = () => conversationIdRef.current === targetConversationId
      && conversationActivationSeqRef.current === activationSeq
      && getRuntime(targetConversationId)?.composerUploadController === uploadController;
    const canApplyResult = () => ownsDisplay() && ownsRuntime() && !uploadController.signal.aborted
      && !getRuntime(targetConversationId)?.abortRequested;
    if (ownsDisplay()) {
      setComposerAttachment({
        name: file.name,
        size: file.size,
        type: file.type,
        uploaded: false,
      });
      setUploadState({ active: true, fileName: file.name });
    }
    try {
      const payload = await uploadAttachment(
        file,
        uploadController.signal,
        targetConversationId,
        executionMode === 'chat' ? { agentId: selectionId } : { workflowId: selectionId },
      );
      const nextAttachment = {
        name: payload?.attachment?.file_name || file.name,
        size: payload?.attachment?.size_bytes ?? file.size,
        type: payload?.attachment?.content_type || file.type,
        uploaded: true,
        documentId: payload?.attachment?.document_id || payload?.document?.id || null,
        attachmentId: payload?.attachment?.attachment_id || null,
        title: payload?.attachment?.title || file.name,
        conversationId: payload?.attachment?.conversation_id || targetConversationId,
      };
      if (canApplyResult()) {
        applyConversationSnapshot(payload?.conversation || null);
        setComposerAttachment(nextAttachment);
        showToast('success', `document uploaded: ${String(file.name || '').toLowerCase()}`);
      }
    } catch (error) {
      if (ownsDisplay()) setComposerAttachment(null);
      if (canApplyResult() && error?.name !== 'AbortError') {
        showToast('error', `upload failed: ${String(file.name || '').toLowerCase()}`);
      }
      throw error;
    } finally {
      // A stopped request still releases its own chrome, but an old request
      // must never clean up a newer upload or a different activation.
      if (ownsDisplay()) {
        if (uploadController.signal.aborted || getRuntime(targetConversationId)?.abortRequested) setComposerAttachment(null);
        setUploadState({ active: false, fileName: '' });
      }
      if (ownsRuntime()) setRuntimeFetchController(null, targetConversationId);
      if (getRuntime(targetConversationId)?.composerUploadController === uploadController) {
        mutateRuntime(targetConversationId, (rt) => { rt.composerUploadController = null; });
      }
    }
  }

  function handleAttachmentClear() {
    setComposerAttachment(null);
  }


  return {
    uploadAttachment,
    uploadChatImage,
    handleAttachmentSelect,
    handleAttachmentClear,
  };
}
