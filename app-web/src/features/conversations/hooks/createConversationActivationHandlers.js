import { splitTaskRuntimeRestoreOrder } from '../../tasks/model/task-runtime-paging.js';

export function createConversationActivationHandlers(ctx) {
  const {
    API_BASE,
    activeRuntimeTargetConvId,
    apiFetch,
    applyContextUsage,
    buildTaskRuntimeRecord,
    chatImageFallbacksByTaskIdFromMessages,
    clearDraftConversationState,
    contextUsageFromConversationDetail,
    conversationIdRef,
    draftConversationRef,
    estimateContextUsageFromConversationDetail,
    findConversationById,
    findProjectByConversationId,
    flushRuntimeTasksToWorkspace,
    getRuntime,
    invalidateConversationActivation,
    isConversationActivationCurrent,
    isTaskActuallyActive,
    isTerminalTaskStatus,
    latestContextUsageFromTasks,
    loadStoredContextUsage,
    mergeChatImageRefs,
    modeLocationRef,
    mutateRuntime,
    pendingCreatedDetailRef,
    restoreTaskRuntimes,
    runtimesRef,
    setComposerAttachment,
    setConversationAttachments,
    setConversationId,
    setLocalWorkspace,
    setStoredConversationId,
    setUploadState,
    setViewMode,
    setWorkspaceState,
    sortTaskIdsForRestore,
    syncDisplayedRuntime,
    taskImageAttachmentsRef,
    taskSummaryToRuntimeTask,
    timestampValue,
    updateTaskRuntimeState,
    userCancelledTaskIdsRef,
    viewModeRef,
    workspaceState,
    workspaceStateWithConversationDetail,
  } = ctx;

  function applyConversationSnapshot(detail) {
    if (!detail) return;
    setConversationAttachments(Array.isArray(detail.attachments) ? detail.attachments : []);
    const workspacePath = detail.current_working_dir
      || detail.current_workdir
      || detail.cwd
      || detail.workspace_path
      || window.haish?.homePath
      || null;
    setLocalWorkspace({
      path: workspacePath,
      label: detail.workspace_label || null,
    });
  }

  // Called when the user navigates AWAY from a conversation. Previously this
  // wiped the global refs + busy state — which had the side effect of killing
  // any in-flight stream for the conversation being left. With per-conversation
  // runtimes, leaving is now a pure-display operation: the leaving runtime is
  // preserved (its stream keeps running in the background), we only reset the
  // ambient UI bits that don't belong to any conversation (upload chrome,
  // runtime state). The displayed React state will be re-synced when the new
  // conversation activates via `syncDisplayedRuntime`.
  function detachActiveRunFromCurrentConversation() {
    setUploadState({ active: false, fileName: '' });
    setComposerAttachment(null);
  }

  function runtimeTaskFromConversationTask(task) {
    if (!task) return null;
    if (task.taskId) return { ...task };
    if (task.task_id) return taskSummaryToRuntimeTask(task, []);
    return null;
  }

  function activateConversationShell(projectId, nextConversationId) {
    if (!nextConversationId || nextConversationId === conversationIdRef.current) return;
    // Leaving a draft without sending must not keep a local draft selection.
    if (draftConversationRef.current && draftConversationRef.current.id !== nextConversationId) {
      clearDraftConversationState({ clearComposer: false });
    }
    const previousId = conversationIdRef.current;
    if (previousId) flushRuntimeTasksToWorkspace(previousId);
    if (previousId && previousId !== nextConversationId) {
      detachActiveRunFromCurrentConversation();
    }
    conversationIdRef.current = nextConversationId;
    setConversationId(nextConversationId);
    setStoredConversationId(nextConversationId);
    // 先用本地记的读数把表盘点亮（没读数就是空表盘），详情到达后再按采样时刻仲裁。
    applyContextUsage(loadStoredContextUsage(nextConversationId), {
      ownerConversationId: nextConversationId,
    });
    // 运行时已经就绪的会话不会再拉详情（conversationRuntimeIsCurrent 直接返回 null），
    // 这时表盘只剩本地缓存这一份来源：缓存被判无效（旧版本的估算条目）或这台机器
    // 从没记过这条会话时，表盘就停在 0k。工作区快照里本来就带着服务端的实测值
    // （任务快照 + 会话级落盘值），先拿它把表盘描上，不等下一轮实时采样。
    const summaryConversation = findConversationById(workspaceState, nextConversationId);
    applyContextUsage(
      latestContextUsageFromTasks(summaryConversation?.tasks, nextConversationId),
      { ownerConversationId: nextConversationId },
    );
    applyContextUsage(
      contextUsageFromConversationDetail(summaryConversation, nextConversationId),
      { ownerConversationId: nextConversationId },
    );

    const project = workspaceState.projects.find((item) => item.id === projectId)
      || findProjectByConversationId(workspaceState, nextConversationId);
    setLocalWorkspace({
      path: project?.workspacePath || window.haish?.homePath || null,
      label: project?.workspaceLabel || project?.name || null,
    });
    setConversationAttachments([]);

    const existingRuntime = getRuntime(nextConversationId);
    if (existingRuntime) {
      syncDisplayedRuntime(existingRuntime);
      return;
    }

    const summaryTasks = (Array.isArray(summaryConversation?.tasks) ? summaryConversation.tasks : [])
      .map(runtimeTaskFromConversationTask)
      .filter(Boolean);
    const taskEntries = summaryTasks
      .map((task) => [task.taskId || task.id, task])
      .filter(([taskId]) => Boolean(taskId));
    const taskOrder = taskEntries.map(([taskId]) => taskId);
    const activeTask = summaryTasks.find(isTaskActuallyActive) || null;
    mutateRuntime(nextConversationId, (rt) => {
      rt.taskRuntimeState = {
        activeTaskId: activeTask?.taskId || activeTask?.id || null,
        pendingTask: null,
        taskOrder,
        tasksById: Object.fromEntries(taskEntries),
      };
      rt.busy = Boolean(activeTask);
      rt.activeRunId = null;
      rt.activeTaskId = activeTask?.taskId || activeTask?.id || null;
      rt.fetchController = null;
      rt.answerBuffer = '';
      rt.cancelledRunIds = new Set();
      rt.abortRequested = false;
      rt.shellSeeded = true;
    });
  }

  async function activateConversationDetail(
    detail,
    { restoreLatest = true, activationSeq = null, signal } = {},
  ) {
    if (!detail?.conversation_id) return;
    // Race model: standalone activates bump the activation seq. Conversation
    // selection passes its existing seq so the immediate shell switch and the
    // later detail hydration share the same stale-response guard.
    const nextActivationSeq = activationSeq || invalidateConversationActivation();
    const isCurrentActivation = () => isConversationActivationCurrent(nextActivationSeq);
    // Activating a real conversation always ends any unsent local draft.
    if (
      draftConversationRef.current
      && draftConversationRef.current.id !== detail.conversation_id
      && pendingCreatedDetailRef.current?.conversation_id !== detail.conversation_id
    ) {
      clearDraftConversationState({ clearComposer: false });
    }
    const previousIdForFlush = conversationIdRef.current;
    if (previousIdForFlush && previousIdForFlush !== detail.conversation_id) {
      flushRuntimeTasksToWorkspace(previousIdForFlush);
    }
    if (!isCurrentActivation()) return;
    const restoredConversationId = detail.conversation_id;
    if (conversationIdRef.current && conversationIdRef.current !== restoredConversationId) {
      detachActiveRunFromCurrentConversation();
    }
    conversationIdRef.current = restoredConversationId;
    const restoredTasks = Array.isArray(detail.tasks) ? detail.tasks : [];
    const messageImageFallbacks = chatImageFallbacksByTaskIdFromMessages(detail.messages, restoredConversationId);
    const restoredTaskIds = sortTaskIdsForRestore(restoredTasks);
    const latestTaskId = detail.last_task_id || (restoredTasks.length ? restoredTasks[restoredTasks.length - 1].task_id : null);
    const latestTask = restoredTasks.find((task) => task.task_id === latestTaskId);
    const restoredExecutionMode = latestTask?.execution_mode || detail.execution_mode;
    if (restoreLatest && restoredExecutionMode) {
      const restoredMode = restoredExecutionMode === 'bot' ? 'workflow' : 'chat';
      viewModeRef.current = restoredMode;
      setViewMode(restoredMode);
    }
    // 表盘：本地记的上一次读数 → 服务端任务记录里的实测快照 → 会话级落盘值
    // （没有采样时刻，只在前面都没读数时当兜底，fork 继承就是这条路）→ 历史估算。
    // 四份都交给表盘仲裁：实测压过估算、按采样时刻取新，空候选不会改动现有读数。
    setConversationId(restoredConversationId);
    setStoredConversationId(restoredConversationId);
    applyContextUsage(
      loadStoredContextUsage(restoredConversationId),
      { ownerConversationId: restoredConversationId },
    );
    applyContextUsage(
      latestContextUsageFromTasks(detail.tasks, restoredConversationId),
      { ownerConversationId: restoredConversationId },
    );
    applyContextUsage(
      contextUsageFromConversationDetail(detail, restoredConversationId),
      { ownerConversationId: restoredConversationId },
    );
    applyContextUsage(
      estimateContextUsageFromConversationDetail(detail),
      { ownerConversationId: restoredConversationId },
    );
    applyConversationSnapshot(detail);
    setWorkspaceState((state) => workspaceStateWithConversationDetail(state, detail, true));

    // If the conversation we're switching INTO already has a runtime with a
    // live stream, don't blow away its in-flight state — just bring the
    // display up to date with whatever the runtime currently holds. Otherwise
    // (no runtime or a fully-quiescent one) we rebuild task state from
    // the freshly-fetched detail and seed/refresh the runtime accordingly.
    const incomingRuntime = getRuntime(restoredConversationId);
    const incomingHasInflight = Boolean(
      incomingRuntime
      && !incomingRuntime.shellSeeded
      && (incomingRuntime.busy || incomingRuntime.activeRunId || incomingRuntime.fetchController)
    );
    let taskIdsToRestore = [];

    if (incomingHasInflight) {
      syncDisplayedRuntime(incomingRuntime);
    } else {
      const previousTasksById = incomingRuntime?.taskRuntimeState?.tasksById || {};
      const nextTasks = restoredTasks.map((task) => {
        const summaryTask = taskSummaryToRuntimeTask(
          task,
          mergeChatImageRefs(
            taskImageAttachmentsRef.current.get(task.task_id) || [],
            messageImageFallbacks.get(task.task_id) || [],
          ),
        );
        const previousTask = previousTasksById[task.task_id];
        if (
          previousTask?.runtimeHydrated
          && previousTask.updatedAt === summaryTask.updatedAt
        ) {
          return previousTask;
        }
        taskIdsToRestore.push(task.task_id);
        return summaryTask;
      });
      const activeTask = nextTasks.find(isTaskActuallyActive) || null;
      const nextTaskRuntimeState = {
        activeTaskId: activeTask?.taskId || null,
        pendingTask: null,
        taskOrder: restoredTaskIds,
        tasksById: Object.fromEntries(
          nextTasks.map((task) => [task.taskId, task])
        ),
      };
      mutateRuntime(restoredConversationId, (rt) => {
        rt.taskRuntimeState = nextTaskRuntimeState;
        rt.busy = Boolean(activeTask);
        rt.activeRunId = null;
        rt.activeTaskId = activeTask?.taskId || null;
        rt.fetchController = null;
        rt.answerBuffer = '';
        rt.cancelledRunIds = new Set();
        rt.abortRequested = false;
        rt.shellSeeded = false;
      });
    }

    if (restoreLatest && taskIdsToRestore.length > 0) {
      const restoreOrder = [
        latestTaskId,
        ...taskIdsToRestore.slice().reverse().filter((taskId) => taskId !== latestTaskId),
      ].filter((taskId) => taskIdsToRestore.includes(taskId));
      // Hydrate only the newest slice up front. Older turns keep the summary the
      // conversation detail already carries and are hydrated in pages when the
      // user scrolls up (see task-runtime-paging.js).
      const { initialIds } = splitTaskRuntimeRestoreOrder(restoreOrder);
      try {
        await restoreTaskRuntimes(initialIds, {
          targetConversationId: restoredConversationId,
          isCurrentActivation,
          signal,
        });
      } catch (error) {
        if (!isCurrentActivation() || signal?.aborted) return;
        console.error('task runtime batch restore failed', error);
      }
    }
  }

  async function fetchConversationDetail(nextConversationId, { signal } = {}) {
    const detailResponse = await apiFetch(`${API_BASE}/api/conversations/${nextConversationId}`, {
      method: 'GET',
      signal,
    }, { json: false });
    if (!detailResponse.ok) {
      // 状态码要跟着错误一起走：调用方按 404 分流（那是「记录已经没了」，不是故障）。
      const error = new Error(`conversation restore failed: ${detailResponse.status}`);
      error.status = detailResponse.status;
      throw error;
    }
    return detailResponse.json();
  }

  // 服务端已经确认不存在的会话（404）。恢复链是从同一份过期的工作区快照里挑下一个
  // 目标的，所以把这些墓碑记下来：两条已删会话才不会互相指着对方来回弹
  // （404 → 换目标 → 404 → …），链一定收敛到活着的会话或空白对话。
  const missingConversationIds = new Set();

  // 服务端说这个会话不存在了（404）：把本地那一行抹掉，顺手清干净所有还指着它的
  // 记忆（运行时、模式定位、落盘的选中 id），并挑一个能接手的会话交给调用方。
  //
  // 现场就是空草稿被清掉那次：切走时前端删了它、列表要等下一次轮询才刷新，于是
  // 点那行会拿到 404。这里补上「服务端已经删了、本地还留着」的窗口，让 404 变成一次
  // 静默的换目标，而不是用户眼前的一条报错。
  //
  // 只做本地收敛，不发请求：删除是幂等的，重复触发没有副作用。
  //
  // snapshot：调用方手上有更新的工作区快照时用它（启动恢复就是这样——ctx 里的
  // workspaceState 还停在挂载那一刻，项目列表都还没进来）。
  function dropMissingConversation(conversationId, { projectId = null, snapshot = null } = {}) {
    if (!conversationId) return null;
    missingConversationIds.add(conversationId);
    const state = snapshot || workspaceState;
    const ownerProject = (projectId
      ? state.projects.find((project) => project.id === projectId)
      : null)
      || findProjectByConversationId(state, conversationId)
      || null;
    const wasSelected = conversationIdRef.current === conversationId
      || (state.activeConversationId || null) === conversationId;
    const executionMode = viewModeRef.current === 'chat' ? 'chat' : 'bot';
    const candidates = (ownerProject?.conversations || [])
      .filter((conversation) => !missingConversationIds.has(conversation.id));
    // 同模式的会话优先：用户就在这个模式下，换过去不必再切视图。
    const fallback = candidates.find((conversation) => conversation.executionMode === executionMode)
      || candidates[0]
      || null;

    runtimesRef.current.delete(conversationId);
    const locations = modeLocationRef.current;
    for (const mode of Object.keys(locations)) {
      if (locations[mode]?.conversationId === conversationId) locations[mode] = null;
    }
    setWorkspaceState((state) => {
      const projects = state.projects.map((project) => (
        project.conversations.some((conversation) => conversation.id === conversationId)
          ? {
              ...project,
              conversations: project.conversations.filter(
                (conversation) => conversation.id !== conversationId,
              ),
            }
          : project
      ));
      return {
        ...state,
        projects,
        activeConversationId: state.activeConversationId === conversationId
          ? null
          : state.activeConversationId,
      };
    });
    // 落盘的选中 id 指着它的话一并清掉；调用方接手新会话时会重新写入。
    if (wasSelected) setStoredConversationId(null);

    return {
      projectId: ownerProject?.id || projectId || null,
      fallbackConversationId: fallback?.id || null,
      wasSelected,
    };
  }

  function ensureTaskForEvent(event, targetConvId = null) {
    const eventConversationId = event.conversation_id || null;
    const ownerConvId = activeRuntimeTargetConvId(targetConvId);
    if (!ownerConvId) throw new Error('runtime event requires a conversation owner');
    if (eventConversationId && ownerConvId && eventConversationId !== ownerConvId) {
      return null;
    }
    const ownerRuntime = getRuntime(ownerConvId);
    if (!ownerRuntime) throw new Error(`conversation runtime is missing: ${ownerConvId}`);
    // After Stop, the current run is aborted until the next executeQuest resets it.
    // Do not re-materialize tasks from late NDJSON events after a run is terminal.
    if (ownerRuntime?.abortRequested) {
      if (event.task_id) userCancelledTaskIdsRef.current.add(event.task_id);
      return null;
    }
    const seedActiveTaskId = ownerRuntime.activeTaskId || ownerRuntime.taskRuntimeState.activeTaskId;
    const taskId = event.task_id || seedActiveTaskId;
    if (!taskId) return null;
    // User-cancelled turns must never be re-created by late stream events.
    // Also block when the local pending draft id was cancelled before the server
    // task id arrived, and promote the server id into the cancel set.
    if (userCancelledTaskIdsRef.current.has(taskId)) {
      return null;
    }
    const pendingId = ownerRuntime?.taskRuntimeState?.pendingTask?.id
      || ownerRuntime?.taskRuntimeState?.pendingTask?.taskId
      || null;
    if (pendingId && userCancelledTaskIdsRef.current.has(pendingId)) {
      if (event.task_id) userCancelledTaskIdsRef.current.add(event.task_id);
      return null;
    }

    updateTaskRuntimeState((state) => {
      const existingTask = state.tasksById[taskId];
      if (existingTask) {
        return state.activeTaskId === taskId ? state : { ...state, activeTaskId: taskId };
      }
      const pendingTask = state.pendingTask;
      const baseTask = buildTaskRuntimeRecord(event, pendingTask);
      const updatedAt = timestampValue(event.created_at) || timestampValue(event.timestamp) || Date.now();
      return {
        ...state,
        activeTaskId: taskId,
        pendingTask: null,
        taskOrder: [...state.taskOrder, taskId],
        tasksById: {
          ...state.tasksById,
          [taskId]: {
            ...baseTask,
            taskId: taskId,
            conversationId: event.conversation_id || baseTask.conversationId,
            loopIndex: Math.max(baseTask.loopIndex || 0, event.loop_index || 0),
            updatedAt,
          },
        },
      };
    }, ownerConvId);

    mutateRuntime(ownerConvId, (rt) => {
      if (rt.activeTaskId === taskId) return false;
      rt.activeTaskId = taskId;
      return true;
    });
    return taskId;
  }

  function updateTaskById(taskId, updater, targetConvId = null, options = {}) {
    if (!taskId) return;
    updateTaskRuntimeState((state) => {
      const task = state.tasksById[taskId];
      if (!task) return state;
      const expectedConvId = activeRuntimeTargetConvId(targetConvId);
      if (task.conversationId && expectedConvId && task.conversationId !== expectedConvId) {
        return state;
      }
      const rawNextTask = typeof updater === 'function' ? updater(task) : { ...task, ...updater };
      if (rawNextTask === task) return state;
      // Terminal status (done/failed/cancelled) is sticky. Late-arriving stream
      // events must not regress a finished task back into running/queued — that's
      // what made the sidebar show a loading spinner for already-cancelled tasks.
      const taskWasTerminal = isTerminalTaskStatus(task.status);
      const nextWouldBeTerminal = isTerminalTaskStatus(rawNextTask?.status);
      const nextTask = taskWasTerminal && !nextWouldBeTerminal && !options.allowTerminalReset
        ? {
            ...rawNextTask,
            status: task.status,
            stage: rawNextTask?.stage || task.stage,
            completedAt: rawNextTask?.completedAt || task.completedAt,
            serverFinished: true,
          }
        : rawNextTask;
      return {
        ...state,
        tasksById: {
          ...state.tasksById,
          [taskId]: {
            ...nextTask,
            updatedAt: Date.now(),
          },
        },
      };
    }, targetConvId);
  }

  function getTaskById(taskId, targetConvId = null) {
    if (!taskId) return null;
    const convId = activeRuntimeTargetConvId(targetConvId);
    if (!convId) throw new Error('task lookup requires a conversation owner');
    return getRuntime(convId)?.taskRuntimeState?.tasksById?.[taskId] || null;
  }

  return {
    applyConversationSnapshot,
    detachActiveRunFromCurrentConversation,
    activateConversationShell,
    activateConversationDetail,
    fetchConversationDetail,
    dropMissingConversation,
    ensureTaskForEvent,
    updateTaskById,
    getTaskById,
  };
}
