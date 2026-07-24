// @haish-esm
// Extracted from AppShell.jsx (Phase C2). Behavior-preserving factory.
export function createConversationRuntime(ctx) {
  const {
    activeRunIdRef,
    activeTaskIdRef,
    answerBufferRef,
    cancelledRunIdsRef,
    conversationIdRef,
    createEmptyWorldTaskState,
    fetchAbortRef,
    normalizeWorkspaceOrdering,
    runtimesRef,
    setBusy,
    setWorkspaceState,
    setWorldTaskState,
    setToast,
    streamTargetConvIdRef,
    taskImageAttachmentsRef,
    toastTimerRef,
    worldTaskStateRef,
  } = ctx;

  function createEmptyRuntime() {
    return {
      worldTaskState: createEmptyWorldTaskState(),
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

  // Mutate a conversation's runtime in place. If `convId` is the conversation
  // currently shown in the UI, also mirror the relevant fields to the displayed
  // React state + legacy refs so existing render paths keep working.
  function mutateRuntime(convId, mutator) {
    if (!convId) return null;
    const rt = getRuntime(convId, { create: true });
    mutator(rt);
    if (convId === conversationIdRef.current) {
      syncDisplayedRuntime(rt);
    }
    return rt;
  }

  // Snapshot a runtime's task state into the displayed React state + refs.
  // Called on conversation switch and after every mutation that targeted the
  // currently-shown conversation.
  function syncDisplayedRuntime(rt) {
    if (!rt) return;
    activeRunIdRef.current = rt.activeRunId;
    activeTaskIdRef.current = rt.activeTaskId;
    fetchAbortRef.current = rt.fetchController;
    answerBufferRef.current = rt.answerBuffer;
    cancelledRunIdsRef.current = rt.cancelledRunIds;
    worldTaskStateRef.current = rt.worldTaskState;
    cacheTaskImageAttachments(rt.worldTaskState);
    setWorldTaskState(rt.worldTaskState);
    setBusy(rt.busy);
  }

  function activeRuntimeTargetConvId(explicit) {
    return explicit || streamTargetConvIdRef.current || conversationIdRef.current;
  }

  function setRuntimeBusy(value, explicit = null) {
    const cid = activeRuntimeTargetConvId(explicit);
    if (cid) {
      mutateRuntime(cid, (rt) => { rt.busy = value; });
      // Task just finished (or was cancelled/errored) — mirror the runtime's
      // task state back into workspaceState so the sidebar entry for THIS
      // conversation reflects the new "done" status, even when the user is
      // currently viewing a different conversation. Otherwise the spinner
      // next to the backgrounded conversation never goes away until the user
      // navigates into it and triggers a re-fetch.
      if (value === false) flushRuntimeTasksToWorkspace(cid);
    } else {
      setBusy(value);
    }
  }

  function flushRuntimeTasksToWorkspace(convId) {
    if (!convId) return;
    const rt = runtimesRef.current.get(convId);
    if (!rt) return;
    const snapshot = rt.worldTaskState;
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
    if (cid) mutateRuntime(cid, (rt) => { rt.activeTaskId = value; });
    else activeTaskIdRef.current = value;
  }
  function setRuntimeActiveRunId(value, explicit = null) {
    const cid = activeRuntimeTargetConvId(explicit);
    if (cid) mutateRuntime(cid, (rt) => { rt.activeRunId = value; });
    else activeRunIdRef.current = value;
  }
  function setRuntimeFetchController(value, explicit = null) {
    const cid = activeRuntimeTargetConvId(explicit);
    if (cid) mutateRuntime(cid, (rt) => { rt.fetchController = value; });
    else fetchAbortRef.current = value;
  }
  function setRuntimeAnswerBuffer(value, explicit = null) {
    const cid = activeRuntimeTargetConvId(explicit);
    if (cid) mutateRuntime(cid, (rt) => { rt.answerBuffer = value; });
    else answerBufferRef.current = value;
  }
  function readRuntimeAnswerBuffer(explicit = null) {
    const cid = activeRuntimeTargetConvId(explicit);
    if (cid) {
      const rt = getRuntime(cid);
      if (rt) return rt.answerBuffer;
    }
    return answerBufferRef.current;
  }

  // `targetConvId` (optional) lets SSE handlers route their write to the
  // conversation that owns the in-flight stream, even if the user has since
  // switched to a different conversation. When omitted, writes use the stream
  // context (if set) or fall back to the currently-shown conversation.
  function updateWorldTaskState(updater, targetConvId = null) {
    const convId = activeRuntimeTargetConvId(targetConvId);
    if (!convId) {
      // No active conversation context — fall back to legacy single-state path
      // so we don't drop the write (rare, mostly during early bootstrap).
      setWorldTaskState((state) => {
        const next = updater(state);
        worldTaskStateRef.current = next;
        cacheTaskImageAttachments(next);
        return next;
      });
      return;
    }
    mutateRuntime(convId, (rt) => {
      rt.worldTaskState = updater(rt.worldTaskState);
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
    createEmptyRuntime,
    getRuntime,
    mutateRuntime,
    syncDisplayedRuntime,
    activeRuntimeTargetConvId,
    setRuntimeBusy,
    flushRuntimeTasksToWorkspace,
    setRuntimeActiveTaskId,
    setRuntimeActiveRunId,
    setRuntimeFetchController,
    setRuntimeAnswerBuffer,
    readRuntimeAnswerBuffer,
    updateWorldTaskState,
    cacheTaskImageAttachments,
    showToast,
  };
}
