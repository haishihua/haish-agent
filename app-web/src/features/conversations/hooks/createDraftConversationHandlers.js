import { eventDeltaText } from '../../chat/model/chat-text.js';
import { compactStreamEvents } from '../../chat/model/stream-events.js';
import {
  forgetDraftConversationId,
  rememberDraftConversationId,
} from '../model/draft-conversation-id.js';

export function createDraftConversationHandlers(ctx) {
  const {
    API_BASE,
    DEFAULT_SESSION_NAME,
    applyConversationSnapshot,
    apiFetch,
    applyContextUsage,
    buildApiHeaders,
    chatFinalizedTaskIdsRef,
    conversationActivationSeqRef,
    conversationDetailAbortRef,
    conversationId,
    conversationIdRef,
    createConversationInProject,
    createDefaultProject,
    createEmptyTaskRuntimeState,
    detachActiveRunFromCurrentConversation,
    draftConversationIdsRef,
    draftConversationRef,
    draftFirstSendRef,
    draftServerCreateRef,
    flushRuntimeTasksToWorkspace,
    generateHexId,
    getRuntime,
    isDefaultConversationName,
    isTaskActuallyActive,
    latestContextUsageFromTasks,
    mutateRuntime,
    normalizeWorkspaceOrdering,
    normalizeRuntimeEvents,
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
      const detail = await createConversationInProject(
        project,
        title || draft.name || DEFAULT_SESSION_NAME,
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

  async function materializeDraftConversationForSend(request) {
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
      return normalizeFetchedTaskRuntime(await response.json());
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

  function normalizeFetchedTaskRuntime(task) {
    const taskId = task?.task_id;
    if (!taskId) throw new Error('task runtime response is missing task_id');
    const cached = taskRuntimeEventCacheRef.current.get(taskId) || null;
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
  }

  async function fetchTaskRuntimeBatch(targetConversationId, taskIds, signal) {
    if (!targetConversationId || !taskIds.length) return [];
    const response = await apiFetch(
      `${API_BASE}/api/conversations/${encodeURIComponent(targetConversationId)}/tasks/runtime`,
      {
        method: 'POST',
        headers: buildApiHeaders(),
        signal,
        body: JSON.stringify({
          tasks: taskIds.map((taskId) => ({
            task_id: taskId,
            after_event_id: taskRuntimeEventCacheRef.current.get(taskId)?.lastEventId || null,
          })),
        }),
      },
      { json: false },
    );
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const error = new Error(payload?.detail || `task batch restore failed: ${response.status}`);
      error.status = response.status;
      throw error;
    }
    const payload = await response.json();
    if (!Array.isArray(payload) || payload.length !== taskIds.length) {
      throw new Error('task batch restore returned an incomplete response');
    }
    if (new Set(payload.map((task) => task.task_id)).size !== taskIds.length
      || payload.some((task) => !taskIds.includes(task.task_id) || task.conversation_id !== targetConversationId)) {
      throw new Error(`task batch does not belong to conversation ${targetConversationId}`);
    }
    const details = payload.map(normalizeFetchedTaskRuntime);
    for (const { normalizedTask } of details) {
      if (normalizedTask.conversation_id !== targetConversationId) {
        throw new Error(`task ${normalizedTask.task_id} does not belong to conversation ${targetConversationId}`);
      }
    }
    return details;
  }

  async function restoreTaskRuntimes(taskIds, {
    targetConversationId,
    isCurrentActivation,
    signal,
  }) {
    if (!targetConversationId) throw new Error('task restore requires a target conversation');
    if (typeof isCurrentActivation !== 'function') throw new Error('task restore requires an activation guard');
    if (!Array.isArray(taskIds) || taskIds.length === 0 || !isCurrentActivation()) return [];
    const details = await fetchTaskRuntimeBatch(targetConversationId, taskIds, signal);
    if (!isCurrentActivation()) return [];
    updateTaskRuntimeState((state) => {
      const tasksById = { ...state.tasksById };
      let activeTaskId = state.activeTaskId;
      for (const { normalizedTask } of details) {
        const taskId = normalizedTask.task_id;
        const nextTask = taskDetailToRuntimeTask(normalizedTask, tasksById[taskId] || null);
        tasksById[taskId] = nextTask;
        if (isTaskActuallyActive(nextTask)) activeTaskId = taskId;
        else if (activeTaskId === taskId) activeTaskId = null;
      }
      return { ...state, activeTaskId, tasksById };
    }, targetConversationId);
    // 表盘：恢复路径拿回来的任务快照就是服务端权威读数（值 + 采样时刻），直接喂给
    // 唯一写入入口——当前会话改表盘、后台会话只落盘，切回去时用的是同一份。
    applyContextUsage(
      latestContextUsageFromTasks(
        details.map((detail) => detail.normalizedTask),
        targetConversationId,
      ),
      { ownerConversationId: targetConversationId },
    );
    return details.map(({ normalizedTask }) => normalizedTask);
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
    // 同上：任务轮询/单任务恢复也把实测快照喂给表盘（没有读数时不会覆盖现有值）。
    applyContextUsage(
      latestContextUsageFromTasks([normalizedTask], targetConversationId),
      { ownerConversationId: targetConversationId },
    );
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
    markDraftConversationKept,
    markDraftFirstSendInFlight,
    clearDraftFirstSendInFlight,
    isDraftFirstSendInFlight,
    materializeDraftConversationForSend,
    fetchTaskRuntimeDetail,
    fetchTaskRuntimeBatch,
    restoreTaskRuntimes,
    restoreLatestTaskRuntime,
    cancelActiveTask,
    queueTaskInput,
    cancelActiveConversationTask,
    stopConversationRuntimeBeforeDelete,
    updateConversationTitle,
  };
}
