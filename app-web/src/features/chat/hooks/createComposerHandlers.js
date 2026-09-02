export function createComposerHandlers(ctx) {
  const {
    API_BASE,
    applyConversationSnapshot,
    apiFetch,
    conversationId,
    conversationIdRef,
    draftConversationRef,
    ensureServerConversationForActiveDraft,
    getRuntime,
    isDraftConversationId,
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
    let resolvedConversationId = targetConversationId;
    if (file && draftConversationRef.current && (
      !resolvedConversationId
      || isDraftConversationId(resolvedConversationId)
      || String(resolvedConversationId).startsWith('draft-')
    )) {
      const detail = await ensureServerConversationForActiveDraft();
      resolvedConversationId = detail?.conversation_id || conversationIdRef.current || resolvedConversationId;
    }
    if (!file || !resolvedConversationId || String(resolvedConversationId).startsWith('draft-')) {
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
    let targetConversationId = conversationIdRef.current || conversationId;
    if (file && draftConversationRef.current && (
      !targetConversationId
      || isDraftConversationId(targetConversationId)
      || String(targetConversationId).startsWith('draft-')
    )) {
      try {
        const detail = await ensureServerConversationForActiveDraft();
        targetConversationId = detail?.conversation_id || conversationIdRef.current || targetConversationId;
      } catch (error) {
        console.error('draft conversation create failed', error);
        showToast('error', String(error?.message || error));
        return;
      }
    }
    if (!file || !targetConversationId || String(targetConversationId).startsWith('draft-')) return;
    const uploadController = new AbortController();
    mutateRuntime(targetConversationId, (rt) => {
      rt.abortRequested = false;
    });
    setRuntimeFetchController(uploadController, targetConversationId);
    setComposerAttachment({
      name: file.name,
      size: file.size,
      type: file.type,
      uploaded: false,
    });
    setUploadState({ active: true, fileName: file.name });
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
      if (conversationIdRef.current === targetConversationId) {
        applyConversationSnapshot(payload?.conversation || null);
        setComposerAttachment(nextAttachment);
        showToast('success', `document uploaded: ${String(file.name || '').toLowerCase()}`);
      }
    } catch (error) {
      if (conversationIdRef.current === targetConversationId) {
        setComposerAttachment(null);
      }
      const targetRuntime = getRuntime(targetConversationId);
      const uploadAborted = targetRuntime?.abortRequested === true;
      if (conversationIdRef.current === targetConversationId && !(uploadAborted || error?.name === 'AbortError')) {
        showToast('error', `upload failed: ${String(file.name || '').toLowerCase()}`);
      }
      throw error;
    } finally {
      const rt = getRuntime(targetConversationId);
      if (rt && rt.fetchController === uploadController) {
        setRuntimeFetchController(null, targetConversationId);
      }
      setUploadState({ active: false, fileName: '' });
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
