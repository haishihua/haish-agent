export function createConversationRuntime(ctx) {
  const {
    conversationIdRef,
    createEmptyTaskRuntimeState,
    normalizeWorkspaceOrdering,
    notifyTaskComplete,
    runtimesRef,
    setBusy,
    setWorkspaceState,
    setTaskRuntimeState,
    setToast,
    streamTargetConvIdRef,
    taskImageAttachmentsRef,
    toastTimerRef,
  } = ctx;

  function createEmptyRuntime() {
    return {
      taskRuntimeState: createEmptyTaskRuntimeState(),
      busy: false,
      activeRunId: null,
      activeTaskId: null,
      fetchController: null,
      answerBuffer: '',
      cancelledRunIds: new Set(),
      abortRequested: false,
      shellSeeded: false,
    };
  }

  function getRuntime(convId, { create = false } = {}) {
    if (!convId) return null;
    const map = runtimesRef.current;
    let rt = map.get(convId);
    if (!rt && create) {
      rt = createEmptyRuntime();
      map.set(convId, rt);
    }
    return rt || null;
  }

  // Mutate the runtime that owns this conversation. React state is only a
  // projection of the currently displayed runtime; runtimesRef is authoritative.
  function mutateRuntime(convId, mutator) {
    if (!convId) throw new Error('conversation runtime mutation requires a conversation id');
    const rt = getRuntime(convId, { create: true });
    const changed = mutator(rt);
    if (changed === false) return rt;
    if (convId === conversationIdRef.current) {
      if (rt.syncBatchDepth > 0) {
        rt.syncBatchPending = true;
      } else {
        syncDisplayedRuntime(rt);
      }
    }
    return rt;
  }

  function batchRuntimeMutations(convId, callback) {
    if (!convId) throw new Error('conversation runtime batch requires a conversation id');
    if (typeof callback !== 'function') throw new TypeError('conversation runtime batch requires a callback');
    const rt = getRuntime(convId, { create: true });
    rt.syncBatchDepth = (rt.syncBatchDepth || 0) + 1;
    try {
      return callback();
    } finally {
      rt.syncBatchDepth -= 1;
      if (rt.syncBatchDepth === 0 && rt.syncBatchPending) {
        rt.syncBatchPending = false;
        if (convId === conversationIdRef.current) syncDisplayedRuntime(rt);
      }
    }
  }

  // Snapshot a runtime's task state into the displayed React state.
  // Called on conversation switch and after every mutation that targeted the
  // currently-shown conversation.
  function syncDisplayedRuntime(rt) {
    if (!rt) return;
    cacheTaskImageAttachments(rt.taskRuntimeState);
    setTaskRuntimeState(rt.taskRuntimeState);
    setBusy(rt.busy);
  }

  function activeRuntimeTargetConvId(explicit) {
    return explicit || streamTargetConvIdRef.current || conversationIdRef.current;
  }

  function setRuntimeBusy(value, explicit = null) {
    const cid = activeRuntimeTargetConvId(explicit);
    if (!cid) throw new Error('conversation runtime busy state requires a conversation id');
    const rt = getRuntime(cid, { create: true });
    const taskJustCompleted = value === false && rt.busy === true;
    const completedTaskId = rt.activeTaskId
      || rt.taskRuntimeState?.activeTaskId
      || rt.taskRuntimeState?.pendingTask?.taskId
      || rt.taskRuntimeState?.pendingTask?.id
      || null;
    const completedTask = completedTaskId
      ? (rt.taskRuntimeState?.tasksById?.[completedTaskId]
        || ((rt.taskRuntimeState?.pendingTask?.taskId || rt.taskRuntimeState?.pendingTask?.id) === completedTaskId
          ? rt.taskRuntimeState.pendingTask
          : null))
      : null;
    mutateRuntime(cid, (current) => { current.busy = value; });
    if (taskJustCompleted && completedTaskId) notifyTaskComplete(cid, completedTaskId, completedTask);
    // Remote/background executions update the sidebar through runtime events
    // and polling snapshots, not through a global UI clock.
    if (value === false) flushRuntimeTasksToWorkspace(cid);
  }

  function flushRuntimeTasksToWorkspace(convId) {
    if (!convId) return;
    const rt = runtimesRef.current.get(convId);
    if (!rt) return;
    const snapshot = rt.taskRuntimeState;
    const taskOrder = Array.isArray(snapshot?.taskOrder) ? snapshot.taskOrder : [];
    const tasksById = snapshot?.tasksById || {};
    // Always mirror runtime tasks, including an empty list after a full
    // Stop-before-stream rollback. Skipping empty used to leave the removed
    // turn in workspaceState and resurrect it on the next sidebar refresh.
    // Also keep a still-pending local draft so the sidebar spinner does not
    // disappear when the user leaves before the server task id arrives.
    const currentTasks = taskOrder.map((taskId) => tasksById[taskId]).filter(Boolean);
    const pendingTask = snapshot?.pendingTask || null;
    if (pendingTask) {
      const pendingKey = pendingTask.taskId || pendingTask.id || null;
      const alreadyPresent = pendingKey
        ? currentTasks.some((task) => (task?.taskId || task?.id) === pendingKey)
        : false;
      if (!alreadyPresent) currentTasks.push(pendingTask);
    }
    setWorkspaceState((state) => {
      let touched = false;
      const projects = state.projects.map((project) => {
        if (!project.conversations.some((c) => c.id === convId)) return project;
        touched = true;
        const now = Date.now();
        return {
          ...project,
          updatedAt: now,
          conversations: project.conversations.map((c) => (
            c.id === convId ? { ...c, tasks: currentTasks, updatedAt: now } : c
          )),
        };
      });
      if (!touched) return state;
      return normalizeWorkspaceOrdering({ ...state, projects });
    });
  }
  function setRuntimeActiveTaskId(value, explicit = null) {
    const cid = activeRuntimeTargetConvId(explicit);
    if (!cid) throw new Error('active task update requires a conversation id');
    mutateRuntime(cid, (rt) => { rt.activeTaskId = value; });
  }
  function setRuntimeActiveRunId(value, explicit = null) {
    const cid = activeRuntimeTargetConvId(explicit);
    if (!cid) throw new Error('active run update requires a conversation id');
    mutateRuntime(cid, (rt) => { rt.activeRunId = value; });
  }
  function setRuntimeFetchController(value, explicit = null) {
    const cid = activeRuntimeTargetConvId(explicit);
    if (!cid) throw new Error('runtime request update requires a conversation id');
    mutateRuntime(cid, (rt) => { rt.fetchController = value; });
  }
  function setRuntimeAnswerBuffer(value, explicit = null) {
    const cid = activeRuntimeTargetConvId(explicit);
    if (!cid) throw new Error('answer buffer update requires a conversation id');
    mutateRuntime(cid, (rt) => { rt.answerBuffer = value; });
  }
  function readRuntimeAnswerBuffer(explicit = null) {
    const cid = activeRuntimeTargetConvId(explicit);
    if (!cid) throw new Error('answer buffer read requires a conversation id');
    return getRuntime(cid, { create: true }).answerBuffer;
  }

  // `targetConvId` (optional) lets SSE handlers route their write to the
  // conversation that owns the in-flight stream, even if the user has since
  // switched to a different conversation. When omitted, writes use the stream
  // context (if set) or fall back to the currently-shown conversation.
  function updateTaskRuntimeState(updater, targetConvId = null) {
    const convId = activeRuntimeTargetConvId(targetConvId);
    if (!convId) throw new Error('task runtime update requires a conversation id');
    mutateRuntime(convId, (rt) => {
      const next = updater(rt.taskRuntimeState);
      if (next === rt.taskRuntimeState) return false;
      rt.taskRuntimeState = next;
      return true;
    });
  }

  function cacheTaskImageAttachments(state) {
    const entries = [
      ...Object.values(state?.tasksById || {}),
      state?.pendingTask,
    ].filter(Boolean);
    for (const task of entries) {
      const taskId = task.taskId || task.id;
      const images = Array.isArray(task.imageAttachments) ? task.imageAttachments : [];
      if (taskId && images.length > 0) {
        taskImageAttachmentsRef.current.set(taskId, images.map((image) => ({ ...image })));
      }
    }
  }

  function showToast(kind, message) {
    const nextToast = { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, kind, message };
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(nextToast);
    toastTimerRef.current = setTimeout(() => {
      setToast((current) => (current?.id === nextToast.id ? null : current));
      toastTimerRef.current = null;
    }, 3200);
  }

  return {
    getRuntime,
    mutateRuntime,
    batchRuntimeMutations,
    syncDisplayedRuntime,
    activeRuntimeTargetConvId,
    setRuntimeBusy,
    flushRuntimeTasksToWorkspace,
    setRuntimeActiveTaskId,
    setRuntimeActiveRunId,
    setRuntimeFetchController,
    setRuntimeAnswerBuffer,
    readRuntimeAnswerBuffer,
    updateTaskRuntimeState,
    showToast,
  };
}
