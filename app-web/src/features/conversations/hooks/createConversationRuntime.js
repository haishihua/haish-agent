// 提示条队列：同屏最多 3 条，每条自己 3200ms 过期，同 kind+message 只刷新已有那条。
const TOAST_STACK_LIMIT = 3;
const TOAST_LIFETIME_MS = 3200;

export function createConversationRuntime(ctx) {
  const {
    conversationIdRef,
    createEmptyTaskRuntimeState,
    normalizeWorkspaceOrdering,
    notifyTaskComplete,
    runtimesRef,
    setBusy,
    setShellSeeded,
    setConversationStopState = () => {},
    setConversationRetryPending = () => {},
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
      pendingRun: null,
      pendingRetry: null,
      runGeneration: 0,
      taskStructureRevision: 0,
      taskRecoveryRequest: null,
      stopPromise: null,
      stopError: null,
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
    if (rt) rt.lastAccessedAt = Date.now();
    return rt || null;
  }

  // Mutate the runtime that owns this conversation. React state is only a
  // projection of the currently displayed runtime; runtimesRef is authoritative.
  function taskStructureKey(state, taskHydration) {
    // REST hydration may add full records and update active status before the
    // detail rebuild. It must NOT hide order/latest/pending changes (e.g. an
    // independent single-task selection adding a turn during recovery).
    return JSON.stringify([
      state?.taskOrder || [], state?.latestTaskId || null,
      state?.pendingTask?.taskId || state?.pendingTask?.id || null,
      ...(!taskHydration ? [Object.keys(state?.tasksById || {}).sort(), state?.activeTaskId || null] : []),
    ]);
  }

  function mutateRuntime(convId, mutator, { taskHydration = false } = {}) {
    if (!convId) throw new Error('conversation runtime mutation requires a conversation id');
    const rt = getRuntime(convId, { create: true });
    const previousState = rt.taskRuntimeState;
    const changed = mutator(rt);
    if (changed === false) return rt;
    // Task state updates are immutable. Buffer/controller-only stream writes
    // need no history scan; content writes compare only the structural boundary.
    if (rt.taskRuntimeState !== previousState
      && taskStructureKey(rt.taskRuntimeState, taskHydration) !== taskStructureKey(previousState, taskHydration)) {
      rt.taskStructureRevision = (rt.taskStructureRevision || 0) + 1;
    }
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
    setConversationRetryPending(Boolean(rt.pendingRetry));
    // Stop is a control-plane state, not evidence that a task is still running.
    // Project it explicitly even when the task list and busy flag are unchanged.
    const pending = Boolean(rt.stopPromise);
    const error = rt.stopError || '';
    setConversationStopState((current) => (
      current?.pending === pending && current?.error === error ? current : { pending, error }
    ));
    // 「这一份时间线还是工作区快照搭的」也是显示状态：会话刚打开时时间线只有标题和
    // 状态，正文还没水合（整段会话的占位判据见 chat/model/conversation-loading.js）。必须
    // 跟着 taskRuntimeState 一起投影，否则渲染层只能去读 runtime 本体。
    setShellSeeded(Boolean(rt.shellSeeded));
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
        return {
          ...project,
          conversations: project.conversations.map((c) => (
            c.id === convId ? { ...c, tasks: currentTasks } : c
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
  function updateTaskRuntimeState(updater, targetConvId = null, { taskHydration = false } = {}) {
    const convId = activeRuntimeTargetConvId(targetConvId);
    if (!convId) throw new Error('task runtime update requires a conversation id');
    mutateRuntime(convId, (rt) => {
      const next = updater(rt.taskRuntimeState);
      if (next === rt.taskRuntimeState) return false;
      rt.taskRuntimeState = next;
      return true;
    }, { taskHydration });
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

  // 计时器注册表：生产由 AppShell 的 ref 持有（跨渲染稳定）；只给了空 ref 的宿主
  // 会在这里被提升成 Map，完全没给 ref 时退化成当前闭包自己的一份。
  let localToastRegistry = null;
  function toastTimerRegistry() {
    if (!toastTimerRef) {
      if (!localToastRegistry) localToastRegistry = new Map();
      return localToastRegistry;
    }
    if (!(toastTimerRef.current instanceof Map)) {
      // 兼容旧式“裸 timeout id”宿主：先把它清掉，避免升级成注册表时留一个孤儿计时器。
      if (toastTimerRef.current != null) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = new Map();
    }
    return toastTimerRef.current;
  }

  function showToast(kind, message) {
    const text = message == null ? '' : String(message);
    if (!text) return;
    // 注册表挂在 AppShell 的 ref 上（Map<去重键, { id, timerId, expiresAt }>）：每次渲染新建的
    // 闭包与卸载清理读到的是同一份，插入顺序就是队列顺序（最旧在前）。
    const registry = toastTimerRegistry();
    const duplicateKey = `${kind}\u0000${text}`;
    const existing = registry.get(duplicateKey);
    // 重复提示不叠第二条：沿用原 id（保持位置），只把它的计时器重置。
    const id = existing?.id ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    let evictedId = null;
    const expiresAt = Date.now() + TOAST_LIFETIME_MS;
    if (!existing) {
      // 超限先丢“最早到期”的那条（= 最久没被刷新过），不是最早插入的那条：
      // 用户反复触发同一条提示时应该留在原地，而不是被下一条新提示立刻挤掉。
      // 连它的计时器一起清，避免它到期时误删别的条目。
      while (registry.size >= TOAST_STACK_LIMIT) {
        let victimKey = null;
        let victim = null;
        for (const [key, entry] of registry) {
          if (!victim || entry.expiresAt < victim.expiresAt) { victimKey = key; victim = entry; }
        }
        clearTimeout(victim.timerId);
        registry.delete(victimKey);
        evictedId = victim.id;
      }
    }
    if (existing) clearTimeout(existing.timerId);
    const timerId = setTimeout(() => {
      const current = registry.get(duplicateKey);
      if (current?.id === id) registry.delete(duplicateKey);
      // 只移除自己这条：期间可能已经弹出了更新的提示。
      setToast((queued) => (Array.isArray(queued) ? queued.filter((toast) => toast.id !== id) : []));
    }, TOAST_LIFETIME_MS);
    registry.set(duplicateKey, { id, timerId, expiresAt });
    if (existing) return;
    const nextToast = { id, kind, message: text };
    setToast((queued) => {
      const kept = Array.isArray(queued) ? queued.filter((toast) => toast.id !== evictedId) : [];
      return [...kept, nextToast].slice(-TOAST_STACK_LIMIT);
    });
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
