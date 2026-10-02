// Schedules only route unattended events. Conversation shells, task hydration
// and workspace projections belong to the ordinary conversation runtime.
export function createScheduledRuntimeHandlers({ applyScheduledEvent, ensureConversationRuntime, restoreLatestTaskRuntime, flushRuntimeTasksToWorkspace, getRuntime, setRuntimeBusy, isTaskActuallyActive }) {
  function event(message) {
    const cid = message.conversation_id;
    const runtime = ensureConversationRuntime(cid);
    runtime.scheduledEventVersion = (runtime.scheduledEventVersion || 0) + 1;
    applyScheduledEvent(message);
    flushRuntimeTasksToWorkspace(cid);
  }
  async function recover(job) {
    const cid = job.conversation_id;
    const taskId = job.last_run?.task_id;
    if (!taskId || !cid) return;
    const runtime = ensureConversationRuntime(cid);
    const version = runtime.scheduledEventVersion;
    const isCurrent = () => getRuntime(cid) === runtime && runtime.scheduledEventVersion === version;
    await restoreLatestTaskRuntime(taskId, { targetConversationId: cid, isCurrentActivation: isCurrent });
    if (!isCurrent()) return;
    // A receipt for an older scheduled task must not clear a newer manual run.
    if (!runtime.activeTaskId || runtime.activeTaskId === taskId) {
      const task = runtime.taskRuntimeState.tasksById[taskId];
      runtime.activeTaskId = taskId;
      const running = isTaskActuallyActive(task);
      setRuntimeBusy(running, cid);
      if (!running) { runtime.activeTaskId = null; runtime.activeRunId = null; }
    }
    flushRuntimeTasksToWorkspace(cid);
  }
  return { event, recover };
}
