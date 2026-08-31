export function createConversationActivationHandlers(ctx) {
  const {
    API_BASE,
    activeRuntimeTargetConvId,
    activeTaskIdRef,
    authFetch,
    buildTaskRuntimeRecord,
    chatImageFallbacksByTaskIdFromMessages,
    clearDraftConversationState,
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
    loadStoredContextUsage,
    mergeChatImageRefs,
    mergeContextUsage,
    mutateRuntime,
    normalizeWorkspaceOrdering,
    pendingCreatedDetailRef,
    restoreConversationTaskRuntimes,
    saveStoredContextUsage,
    setComposerAttachment,
    setContextUsage,
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
    userIdRef,
    viewModeRef,
    workspaceState,
    workspaceStateWithConversationDetail,
    taskRuntimeStateRef,
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
    if (task.task_id) return taskSummaryToRuntimeTask(task, [], userIdRef.current);
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
    const storedContextUsage = loadStoredContextUsage(nextConversationId);
    setContextUsage(storedContextUsage);
    saveStoredContextUsage(storedContextUsage);

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

    const conversation = findConversationById(workspaceState, nextConversationId);
    const summaryTasks = (Array.isArray(conversation?.tasks) ? conversation.tasks : [])
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

  async function activateConversationDetail(detail, { restoreLatest = true, activationSeq = null } = {}) {
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
    // 切走前先把当前 conversation 的实时 taskRuntimeState flush 回
    // workspaceState[当前 conversation].tasks。否则切到别的会话后，旧会话
    // sidebar 节点会回退到上一次 activate 时拉到的 detail.tasks 快照，刚跑
    // 完的任务消失，要再切回去触发一次 fetch 才会重新出现。
    //
    // 必须用 conversationIdRef.current 而不是 state.activeConversationId：
    // handleSelectConversation 在 await fetchConversationDetail 之前就已经
    // setWorkspaceState 把 activeConversationId 改成了新会话，等这里 reducer
    // 跑到时 state.activeConversationId 已经等于 detail.conversation_id，会
    // 误触发 early return，flush 永远不发生。conversationIdRef.current 直到
    // 本函数下面第 ~3651 行才会被更新，所以这里读到的还是真正"切走前"的 id。
    const previousIdForFlush = conversationIdRef.current;
    setWorkspaceState((state) => {
      const previousId = previousIdForFlush;
      if (!previousId || previousId === detail.conversation_id) return state;
      const previousRuntime = getRuntime(previousId);
      const snapshot = previousRuntime ? previousRuntime.taskRuntimeState : taskRuntimeStateRef.current;
      const currentTasks = (snapshot?.taskOrder || [])
        .map((taskId) => snapshot?.tasksById?.[taskId])
        .filter(Boolean);
      const pendingTask = snapshot?.pendingTask || null;
      if (pendingTask) {
        const pendingKey = pendingTask.taskId || pendingTask.id || null;
        const alreadyPresent = pendingKey
          ? currentTasks.some((task) => (task?.taskId || task?.id) === pendingKey)
          : false;
        if (!alreadyPresent) currentTasks.push(pendingTask);
      }
      if (currentTasks.length === 0) return state;
      const now = Date.now();
      return normalizeWorkspaceOrdering({
        ...state,
        projects: state.projects.map((project) => ({
          ...project,
          updatedAt: project.conversations.some((conversation) => conversation.id === previousId)
            ? now
            : project.updatedAt,
          conversations: project.conversations.map((conversation) =>
            conversation.id === previousId
              ? { ...conversation, tasks: currentTasks, updatedAt: now }
              : conversation,
          ),
        })),
      });
    });
    if (!isCurrentActivation()) return;
    const restoredConversationId = detail.conversation_id;
    if (conversationIdRef.current && conversationIdRef.current !== restoredConversationId) {
      detachActiveRunFromCurrentConversation();
    }
    conversationIdRef.current = restoredConversationId;
    const restoredTasks = Array.isArray(detail.tasks) ? detail.tasks : [];
    const messageImageFallbacks = chatImageFallbacksByTaskIdFromMessages(detail.messages, restoredConversationId, userIdRef.current);
    const latestTaskId = detail.last_task_id || (restoredTasks.length ? restoredTasks[restoredTasks.length - 1].task_id : null);
    const latestTask = restoredTasks.find((task) => task.task_id === latestTaskId);
    const restoredExecutionMode = latestTask?.execution_mode || detail.execution_mode;
    if (restoreLatest && restoredExecutionMode) {
      const restoredMode = restoredExecutionMode === 'bot' ? 'workflow' : 'chat';
      viewModeRef.current = restoredMode;
      setViewMode(restoredMode);
    }
    const nextContextUsage = mergeContextUsage(
      loadStoredContextUsage(restoredConversationId),
      estimateContextUsageFromConversationDetail(detail)
    );
    setConversationId(restoredConversationId);
    setStoredConversationId(restoredConversationId);
    setContextUsage(nextContextUsage);
    saveStoredContextUsage(nextContextUsage);
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

    if (incomingHasInflight) {
      syncDisplayedRuntime(incomingRuntime);
    } else {
      const nextTaskRuntimeState = {
        activeTaskId: null,
        pendingTask: null,
        taskOrder: sortTaskIdsForRestore(restoredTasks, latestTaskId),
        tasksById: Object.fromEntries(
          restoredTasks.map((task) => [
            task.task_id,
            taskSummaryToRuntimeTask(
              task,
              mergeChatImageRefs(
                taskImageAttachmentsRef.current.get(task.task_id) || [],
                messageImageFallbacks.get(task.task_id) || [],
              ),
              userIdRef.current,
            ),
          ])
        ),
      };
      mutateRuntime(restoredConversationId, (rt) => {
        rt.taskRuntimeState = nextTaskRuntimeState;
        rt.busy = false;
        rt.activeRunId = null;
        rt.activeTaskId = null;
        rt.fetchController = null;
        rt.answerBuffer = '';
        rt.cancelledRunIds = new Set();
        rt.abortRequested = false;
        rt.shellSeeded = false;
      });
    }

    if (restoreLatest && restoredTasks.length > 0) {
      try {
        await restoreConversationTaskRuntimes(
          restoredTasks.map((task) => task.task_id),
          latestTaskId,
          { targetConversationId: restoredConversationId, isCurrentActivation },
        );
      } catch (error) {
        if (!isCurrentActivation()) return;
        console.error('latest task restore failed', error);
      }
    }
  }

  async function fetchConversationDetail(nextConversationId, { signal } = {}) {
    const detailResponse = await authFetch(`${API_BASE}/api/conversations/${nextConversationId}`, {
      method: 'GET',
      signal,
    }, { json: false });
    if (!detailResponse.ok) {
      throw new Error(`conversation restore failed: ${detailResponse.status}`);
    }
    return detailResponse.json();
  }

  function ensureTaskForEvent(event, targetConvId = null) {
    const eventConversationId = event.conversation_id || null;
    const ownerConvId = targetConvId || conversationIdRef.current;
    if (eventConversationId && ownerConvId && eventConversationId !== ownerConvId) {
      return null;
    }
    const ownerRuntime = ownerConvId ? getRuntime(ownerConvId) : null;
    // After Stop, the current run is aborted until the next executeQuest resets it.
    // Do not re-materialize tasks from late NDJSON events after a run is terminal.
    if (ownerRuntime?.abortRequested) {
      if (event.task_id) userCancelledTaskIdsRef.current.add(event.task_id);
      return null;
    }
    const seedActiveTaskId = ownerRuntime
      ? ownerRuntime.activeTaskId || ownerRuntime.taskRuntimeState.activeTaskId
      : activeTaskIdRef.current || taskRuntimeStateRef.current.activeTaskId;
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

    if (ownerConvId) {
      mutateRuntime(ownerConvId, (rt) => {
        if (rt.activeTaskId === taskId) return false;
        rt.activeTaskId = taskId;
        return true;
      });
    } else {
      activeTaskIdRef.current = taskId;
    }
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
    const runtime = convId ? getRuntime(convId) : null;
    return runtime?.taskRuntimeState?.tasksById?.[taskId]
      || taskRuntimeStateRef.current.tasksById[taskId]
      || null;
  }

  return {
    applyConversationSnapshot,
    detachActiveRunFromCurrentConversation,
    activateConversationShell,
    activateConversationDetail,
    fetchConversationDetail,
    ensureTaskForEvent,
    updateTaskById,
    getTaskById,
  };
}
