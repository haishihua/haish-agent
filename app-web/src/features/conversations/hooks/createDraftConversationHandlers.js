import { eventDeltaText } from '../../chat/model/chat-text.js';
import { compactStreamEvents } from '../../chat/model/stream-events.js';

export function createDraftConversationHandlers(ctx) {
  const {
    API_BASE,
    DEFAULT_SESSION_NAME,
    applyConversationSnapshot,
    apiFetch,
    buildApiHeaders,
    chatFinalizedTaskIdsRef,
    conversationActivationSeqRef,
    conversationDetailAbortRef,
    conversationId,
    conversationIdRef,
    createConversationInProject,
    createDefaultProject,
    createEmptyContextUsage,
    createEmptyTaskRuntimeState,
    detachActiveRunFromCurrentConversation,
    draftConversationRef,
    flushRuntimeTasksToWorkspace,
    generateHexId,
    getRuntime,
    isDefaultConversationName,
    isTaskActuallyActive,
    mutateRuntime,
    normalizeWorkspaceOrdering,
    normalizeRuntimeEvents,
    pendingCreatedDetailRef,
    rekeyChatDraft,
    runtimesRef,
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
    taskRuntimeEventCacheRef,
    taskRuntimeFetchesRef,
    taskUpdatedTimestamp,
    titleFromTaskText,
    updateTaskRuntimeState,
    userCancelledTaskIdsRef,
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
      apiFetch(`${API_BASE}/api/conversations/${encodeURIComponent(pendingServerId)}`, {
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
      composerScopeId: draftId,
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
    const emptyUsage = createEmptyContextUsage(null);
    setContextUsage(emptyUsage);
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
    rekeyChatDraft?.(previousDraftId, realId);
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

    const nextTitle = titleFromTaskText(request?.displayText || request?.text || '') || draft.name || DEFAULT_SESSION_NAME;
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
    if (detail.project_id !== draft.projectId) {
      throw new Error('draft conversation project mismatch');
    }

    const realId = detail.conversation_id;
    const previousDraftId = draft.id;
    setWorkspaceState((state) => workspaceStateWithConversationDetail(state, detail, true));
    setStoredConversationId(realId);
    rekeyChatDraft?.(previousDraftId, realId);
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
    const existing = taskRuntimeFetchesRef.current.get(taskId);
    if (existing) return existing;
    const request = (async () => {
      const cached = taskRuntimeEventCacheRef.current.get(taskId) || null;
      const cursorQuery = cached?.lastEventId
        ? `&after_event_id=${encodeURIComponent(cached.lastEventId)}`
        : '';
      const response = await apiFetch(`${API_BASE}/api/tasks/${taskId}?event_view=runtime${cursorQuery}`, {
        method: 'GET',
      }, { json: false });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const error = new Error(payload?.detail || `task restore failed: ${response.status}`);
        error.status = response.status;
        error.taskId = taskId;
        throw error;
      }
      const task = await response.json();
      const incomingEvents = normalizeRuntimeEvents(task.events);
      const appendToCache = Boolean(task.events_delta && cached);
      const events = compactStreamEvents(
        appendToCache ? [...cached.events, ...incomingEvents] : incomingEvents,
        eventDeltaText,
      );
      const lastEventId = incomingEvents[incomingEvents.length - 1]?.event_id
        || cached?.lastEventId
        || null;
      taskRuntimeEventCacheRef.current.set(taskId, { lastEventId, events });
      return { normalizedTask: { ...task, events, events_delta: false }, events };
    })();
    taskRuntimeFetchesRef.current.set(taskId, request);
    try {
      return await request;
    } finally {
      if (taskRuntimeFetchesRef.current.get(taskId) === request) {
        taskRuntimeFetchesRef.current.delete(taskId);
      }
    }
  }

  async function restoreTaskRuntime(taskId, {
    targetConversationId,
    isCurrentActivation,
  }) {
    if (!targetConversationId) throw new Error('task restore requires a target conversation');
    if (typeof isCurrentActivation !== 'function') throw new Error('task restore requires an activation guard');
    if (!isCurrentActivation()) return;
    const detail = await fetchTaskRuntimeDetail(taskId);
    if (!detail || !isCurrentActivation()) return;
    const { normalizedTask } = detail;
    if (normalizedTask.conversation_id !== targetConversationId) {
      throw new Error(`task ${taskId} does not belong to conversation ${targetConversationId}`);
    }
    updateTaskRuntimeState((state) => {
      const nextTask = taskDetailToRuntimeTask(normalizedTask, state.tasksById[taskId] || null);
      const taskOrder = state.taskOrder.includes(taskId) ? state.taskOrder : [...state.taskOrder, taskId];
      return {
        ...state,
        activeTaskId: isTaskActuallyActive(nextTask)
          ? taskId
          : (state.activeTaskId === taskId ? null : state.activeTaskId),
        taskOrder,
        tasksById: {
          ...state.tasksById,
          [taskId]: nextTask,
        },
      };
    }, targetConversationId);
    return normalizedTask;
  }

  async function restoreLatestTaskRuntime(taskId, { targetConversationId, isCurrentActivation }) {
    if (!targetConversationId) throw new Error('latest task restore requires a target conversation');
    if (typeof isCurrentActivation !== 'function') throw new Error('latest task restore requires an activation guard');
    if (!taskId) {
      return;
    }
    return restoreTaskRuntime(taskId, {
      targetConversationId,
      isCurrentActivation,
    });
  }

  async function cancelActiveTask(taskId) {
    return apiFetch(`${API_BASE}/api/tasks/${taskId}/cancel`, {
      method: 'POST',
    });
  }

  async function queueTaskInput(taskId, message, imageAttachments = [], displayMessage = message) {
    const images = Array.isArray(imageAttachments) ? imageAttachments : [];
    const response = await apiFetch(`${API_BASE}/api/tasks/${taskId}/inputs`, {
      method: 'POST',
      headers: buildApiHeaders(),
      body: JSON.stringify({
        message,
        image_attachments: images.map((image) => ({
          image_id: image.image_id,
          path: image.path,
          mime: image.mime || null,
        })),
      }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.detail || `Failed to queue instruction (${response.status})`);
    }
    const payload = await response.json();
    // The SSE stream only emits `task_input_applied` once the agent loop picks
    // the steering message up; `task_input_queued` is persisted server-side but
    // never streamed back. Append it to the running task's event log right away
    // so the user's instruction appears in the chat as soon as it enters the
    // queue, while the trace above keeps showing the in-flight tool calls.
    // The later `task_input_applied` stream event then flips it to "applied".
    const queuedEvent = payload?.event;
    const queuedPayload = queuedEvent?.payload || {};
    if (queuedEvent && taskId) {
      const queuedMessage = String(displayMessage || queuedPayload.message || message || '').trim();
      const queuedInputId = queuedPayload.input_id || payload?.input_id || null;
      const queuedImages = images.length > 0 ? images : (queuedPayload.image_attachments || []);
      updateTaskRuntimeState((state) => {
        const task = state?.tasksById?.[taskId];
        if (!task) return state;
        const eventLog = Array.isArray(task.eventLog) ? task.eventLog : [];
        return {
          ...state,
          tasksById: {
            ...state.tasksById,
            [taskId]: {
              ...task,
              updatedAt: Date.now(),
              eventLog: [
                ...eventLog,
                {
                  type: 'task_input_queued',
                  timestamp: queuedEvent.created_at || new Date().toISOString(),
                  inputId: queuedInputId,
                  message: queuedMessage,
                  imageAttachments: queuedImages,
                  status: 'pending',
                  taskId,
                  conversationId: queuedEvent.conversation_id || null,
                },
              ],
            },
          },
        };
      });
    }
    return payload;
  }

  async function cancelActiveConversationTask(nextConversationId) {
    if (!nextConversationId) return null;
    return apiFetch(`${API_BASE}/api/conversations/${nextConversationId}/tasks/cancel`, {
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
    const taskState = targetRuntime?.taskRuntimeState || null;
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
        rt.taskRuntimeState = {
          ...rt.taskRuntimeState,
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
    const response = await apiFetch(`${API_BASE}/api/conversations/${conversationId}`, {
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
    restoreLatestTaskRuntime,
    cancelActiveTask,
    queueTaskInput,
    cancelActiveConversationTask,
    stopConversationRuntimeBeforeDelete,
    updateConversationTitle,
  };
}
