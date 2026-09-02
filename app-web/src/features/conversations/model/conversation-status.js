// Pure helpers for conversation / task running state (no React).
// Keep running detection aligned with `isTaskActuallyActive` in workspace-state:
// streaming writes partial answerText while status stays running/queued, so answer
// presence must NOT hide the sidebar spinner mid-run.

export function workflowTaskDisplayStatus(task) {
  const taskStatus = String(task?.status || '').toLowerCase();
  if (['done', 'completed', 'success', 'failed', 'error', 'cancelled', 'canceled', 'aborted'].includes(taskStatus)) {
    return taskStatus;
  }
  const workflowStatus = String(task?.workflowRun?.status || '').toLowerCase();
  if (workflowStatus === 'waiting_approval' || workflowStatus === 'approval') return 'approval';
  if (workflowStatus === 'waiting_input') return 'waiting_input';
  if (['done', 'completed', 'success', 'failed', 'error', 'cancelled', 'canceled', 'aborted'].includes(workflowStatus)) {
    return workflowStatus;
  }
  return taskStatus;
}

export function conversationHasRunningTask(conversation) {
  const tasks = Array.isArray(conversation?.tasks) ? conversation.tasks : [];
  return tasks.some((task) => {
    const status = workflowTaskDisplayStatus(task);
    if (status !== 'running' && status !== 'queued') return false;
    // Only terminal completion markers override raw running/queued state.
    if (task?.completedAt || task?.completed_at) return false;
    if (task?.serverFinished === true) return false;
    return true;
  });
}
