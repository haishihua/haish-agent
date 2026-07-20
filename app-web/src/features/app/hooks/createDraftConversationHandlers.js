// @haish-esm
// Extracted from AppShell.jsx (Phase C3). Behavior-preserving factory.
export function createDraftConversationHandlers(ctx) {
  const {
    API_BASE,
    DEFAULT_PROJECT_ID,
    DEFAULT_SESSION_NAME,
    applyConversationSnapshot,
    authFetch,
    buildAgentLiveSnapshot,
    buildApiHeaders,
    chatFinalizedTaskIdsRef,
    conversationActivationSeqRef,
    conversationDetailAbortRef,
    conversationId,
    conversationIdRef,
    createConversationInProject,
    createDefaultProject,
    createEmptyContextUsage,
    createEmptyWorldTaskState,
    detachActiveRunFromCurrentConversation,
    draftConversationRef,
    flushRuntimeTasksToWorkspace,
    generateHexId,
    getRuntime,
    isDefaultConversationName,
    isTaskActuallyActive,
    mutateRuntime,
    normalizeWorkspaceOrdering,
    normalizeWorldEvents,
    pendingCreatedDetailRef,
    runtimesRef,
    setAgentLive,
    setComposerAttachment,
    setContextUsage,
    setConversationAttachments,
    setConversationError,
    setConversationId,
    setConversationReady,
    setLocalWorkspace,
    setStoredConversationId,
    setUploadState,
    setWorkspaceState,
    taskDetailToRuntimeTask,
    taskUpdatedTimestamp,
    titleFromTaskText,
    updateWorldTaskState,
    userCancelledTaskIdsRef,
    userIdRef,
    viewModeRef,
    workspaceState,
    workspaceStateWithConversationDetail,
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

  function clearDraftConversationState({ clearComposer = true } = {}) {
    const draft = draftConversationRef.current;
    const pendingDetail = pendingCreatedDetailRef.current;
    if (draft?.id) {
      runtimesRef.current.delete(draft.id);
    }
    // If a draft already forced a server create (e.g. image upload) but the user
    // never sent a message, drop that empty server conversation so it cannot
    // reappear after a later workspace refresh.
    const pendingServerId = pendingDetail?.conversation_id
      || (draft?.serverCreated ? draft.id : null);
    if (pendingServerId && !String(pendingServerId).startsWith('draft-')) {
      authFetch(`${API_BASE}/api/conversations/${encodeURIComponent(pendingServerId)}`, {
        method: 'DELETE',
      }).catch(() => {});
      runtimesRef.current.delete(pendingServerId);
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
    if (previousDraftId) {
      runtimesRef.current.delete(previousDraftId);
    }
    draftConversationRef.current = null;
    pendingCreatedDetailRef.current = null;

    const draftId = `draft-${generateHexId()}`;
    const now = Date.now();
    draftConversationRef.current = {
      id: draftId,
      projectId: project.id,
      workspacePath: project.workspacePath || null,
      workspaceLabel: project.workspaceLabel || project.name || null,
      executionMode,
      name: project.id === DEFAULT_PROJECT_ID ? DEFAULT_SESSION_NAME : 'New Conversation',
      createdAt: now,
    };

    conversationIdRef.current = draftId;
    setConversationId(draftId);
    // Drafts are local-only; do not persist a fake id into storage.
    setStoredConversationId(null);
    setConversationAttachments([]);
    setAgentLive({});
    setLocalWorkspace({
      path: project.workspacePath || window.haish?.homePath || null,
      label: project.workspaceLabel || project.name || null,
    });
    const emptyUsage = createEmptyContextUsage(null);
    setContextUsage(emptyUsage);
    setComposerAttachment(null);
    setUploadState({ active: false, fileName: '' });
    setConversationError('');
    setConversationReady(true);

    mutateRuntime(draftId, (rt) => {
      rt.worldTaskState = createEmptyWorldTaskState();
      rt.busy = false;
      rt.activeRunId = null;
      rt.activeTaskId = null;
      rt.fetchController = null;
      rt.answerBuffer = '';
      rt.cancelledRunIds = new Set();
      rt.abortRequested = false;
      rt.shellSeeded = true;
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

  async function ensureServerConversationForActiveDraft({ title } = {}) {
    const draft = draftConversationRef.current;
    if (!draft?.id) return null;

    if (pendingCreatedDetailRef.current?.conversation_id) {
      return pendingCreatedDetailRef.current;
    }

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
    const detail = await createConversationInProject(
      project,
      title || draft.name || DEFAULT_SESSION_NAME,
      draft.executionMode || (viewModeRef.current === 'chat' ? 'chat' : 'bot'),
    );
    pendingCreatedDetailRef.current = detail;

    const previousDraftId = draft.id;
    const realId = detail.conversation_id;
    const previousRuntime = getRuntime(previousDraftId);
    if (previousRuntime) {
      runtimesRef.current.set(realId, previousRuntime);
      runtimesRef.current.delete(previousDraftId);
    }

    draftConversationRef.current = {
      ...draft,
      id: realId,
      serverCreated: true,
    };
    conversationIdRef.current = realId;
    setConversationId(realId);
    // Still withhold from storage/sidebar until the first user message is sent.
    setStoredConversationId(null);
    applyConversationSnapshot(detail);
    return detail;
  }

  async function materializeDraftConversationForSend(request) {
    const draft = draftConversationRef.current;
    if (!draft) {
      const existingId = conversationIdRef.current || conversationId || null;
      return existingId ? { id: existingId, detail: null } : null;
    }

    const nextTitle = titleFromTaskText(request?.text || '') || draft.name || DEFAULT_SESSION_NAME;
    let detail = pendingCreatedDetailRef.current;
    if (!detail?.conversation_id) {
      detail = await ensureServerConversationForActiveDraft({ title: nextTitle });
    } else if (nextTitle && isDefaultConversationName(detail.title || detail.label || draft.name)) {
      try {
        const renamed = await updateConversationTitle(detail.conversation_id, nextTitle);
        if (renamed) detail = renamed;
      } catch (error) {
        console.warn('draft conversation title update skipped:', error);
      }
    }
    if (!detail?.conversation_id) {
      throw new Error('conversation create failed');
    }

    const realId = detail.conversation_id;
    setWorkspaceState((state) => workspaceStateWithConversationDetail(state, detail, true));
    setStoredConversationId(realId);
    conversationIdRef.current = realId;
    setConversationId(realId);
    applyConversationSnapshot(detail);
    draftConversationRef.current = null;
    pendingCreatedDetailRef.current = null;
    // Return detail so startDeploy can seed the list entry even if React has not
    // flushed the setWorkspaceState above yet.
    return { id: realId, detail };
  }

  async function fetchTaskRuntimeDetail(taskId) {
    if (!taskId) return null;
    const response = await authFetch(`${API_BASE}/api/tasks/${taskId}`, {
      method: 'GET',
    }, { json: false });
    if (!response.ok) {
      throw new Error(`task restore failed: ${response.status}`);
    }
    const task = await response.json();
    const events = normalizeWorldEvents(task.events);
    return { normalizedTask: { ...task, events }, events };
  }

  async function restoreTaskRuntime(taskId, { isCurrentActivation = () => true, updateLiveSnapshot = false } = {}) {
    if (!isCurrentActivation()) return;
    const detail = await fetchTaskRuntimeDetail(taskId);
    if (!detail || !isCurrentActivation()) return;
    const { normalizedTask, events } = detail;
    updateWorldTaskState((state) => ({
      ...state,
      tasksById: {
        ...state.tasksById,
        [taskId]: taskDetailToRuntimeTask(normalizedTask, state.tasksById[taskId] || null, userIdRef.current),
      },
    }));
    if (updateLiveSnapshot) {
      setAgentLive(buildAgentLiveSnapshot(normalizedTask, events));
    }
  }

  async function restoreLatestTaskRuntime(taskId, isCurrentActivation = () => true) {
    if (!taskId) {
      if (isCurrentActivation()) setAgentLive({});
      return;
    }
    await restoreTaskRuntime(taskId, { isCurrentActivation, updateLiveSnapshot: true });
  }

  async function restoreConversationTaskRuntimes(taskIds, latestTaskId, isCurrentActivation = () => true) {
    const uniqueTaskIds = [...new Set((Array.isArray(taskIds) ? taskIds : []).filter(Boolean))];
    if (latestTaskId && uniqueTaskIds.includes(latestTaskId)) {
      try {
        await restoreLatestTaskRuntime(latestTaskId, isCurrentActivation);
      } catch (error) {
        if (isCurrentActivation()) {
          console.warn(`task detail restore skipped: ${latestTaskId}`, error);
        }
      }
    } else if (isCurrentActivation()) {
      setAgentLive({});
    }
    const detailTaskIds = uniqueTaskIds.filter((taskId) => taskId !== latestTaskId);
    for (const taskId of detailTaskIds) {
      if (!isCurrentActivation()) return;
      try {
        await restoreTaskRuntime(taskId, { isCurrentActivation });
      } catch (error) {
        if (isCurrentActivation()) {
          console.warn(`task detail restore skipped: ${taskId}`, error);
        }
      }
    }
  }

  async function cancelActiveTask(taskId) {
    return authFetch(`${API_BASE}/api/tasks/${taskId}/cancel`, {
      method: 'POST',
    });
  }

  async function cancelActiveConversationTask(nextConversationId) {
    if (!nextConversationId) return null;
    return authFetch(`${API_BASE}/api/conversations/${nextConversationId}/tasks/cancel`, {
      method: 'POST',
    });
  }

  function activeTaskIdFromConversationSnapshot(conversation) {
    const candidates = (conversation?.tasks || []).filter((task) => isTaskActuallyActive(task));
    candidates.sort((a, b) => taskUpdatedTimestamp(b) - taskUpdatedTimestamp(a));
    const task = candidates[0];
    return task?.taskId || task?.task_id || task?.id || null;
  }

  async function stopConversationRuntimeBeforeDelete(nextConversationId, conversationSnapshot = null) {
    if (!nextConversationId) return;
    const targetRuntime = getRuntime(nextConversationId);
    const taskState = targetRuntime?.worldTaskState || null;
    const taskId = targetRuntime?.activeTaskId
      || taskState?.activeTaskId
      || activeTaskIdFromConversationSnapshot(conversationSnapshot);
    const runId = targetRuntime?.activeRunId || null;
    if (runId && targetRuntime) targetRuntime.cancelledRunIds.add(runId);
    if (taskId) {
      userCancelledTaskIdsRef.current.add(taskId);
      chatFinalizedTaskIdsRef.current.add(taskId);
    }
    targetRuntime?.fetchController?.abort?.();
    if (targetRuntime) {
      mutateRuntime(nextConversationId, (rt) => {
        rt.worldTaskState = {
          ...rt.worldTaskState,
          activeTaskId: null,
          pendingTask: null,
        };
        rt.activeTaskId = null;
        rt.activeRunId = null;
        rt.fetchController = null;
        rt.busy = false;
      });
    }
    try {
      if (taskId) {
        await cancelActiveTask(taskId);
      } else {
        await cancelActiveConversationTask(nextConversationId);
      }
    } catch (error) {
      console.warn('conversation cleanup before delete skipped:', error);
    }
    runtimesRef.current.delete(nextConversationId);
  }

  async function updateConversationTitle(conversationId, title) {
    const trimmed = String(title || '').trim();
    if (!conversationId || !trimmed) return null;
    const response = await authFetch(`${API_BASE}/api/conversations/${conversationId}`, {
      method: 'PATCH',
      headers: buildApiHeaders(),
      body: JSON.stringify({ title: trimmed }),
    });
    if (!response.ok) {
      throw new Error(`conversation title update failed: ${response.status}`);
    }
    return response.json();
  }

  return {
    invalidateConversationActivation,
    isConversationActivationCurrent,
    isDraftConversationId,
    clearDraftConversationState,
    openDraftConversation,
    ensureServerConversationForActiveDraft,
    materializeDraftConversationForSend,
    fetchTaskRuntimeDetail,
    restoreTaskRuntime,
    restoreLatestTaskRuntime,
    restoreConversationTaskRuntimes,
    cancelActiveTask,
    cancelActiveConversationTask,
    activeTaskIdFromConversationSnapshot,
    stopConversationRuntimeBeforeDelete,
    updateConversationTitle,
  };
}
