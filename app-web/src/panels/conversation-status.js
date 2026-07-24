// @haish-esm
// Pure helpers for conversation / task running state (no React).
// Keep running detection aligned with `isTaskActuallyActive` in workspace-state:
// streaming writes partial answerText while status stays running/queued, so answer
// presence must NOT hide the sidebar spinner mid-run.

export function conversationHasRunningTask(conversation) {
  const tasks = Array.isArray(conversation?.tasks) ? conversation.tasks : [];
  return tasks.some((task) => {
    const status = String(task?.status || '').toLowerCase();
    if (status !== 'running' && status !== 'queued') return false;
    // Only terminal completion markers override raw running/queued state.
    if (task?.completedAt || task?.completed_at) return false;
    if (task?.serverFinished === true) return false;
    return true;
  });
}

export function conversationLatestTerminalStatus(conversation) {
  const tasks = Array.isArray(conversation?.tasks) ? conversation.tasks : [];
  for (let index = tasks.length - 1; index >= 0; index -= 1) {
    const status = String(tasks[index]?.status || '').toLowerCase();
    if (status === 'done' || status === 'completed' || status === 'success') return 'done';
    if (status === 'failed' || status === 'error') return 'failed';
    if (status === 'cancelled' || status === 'canceled' || status === 'aborted') return 'cancelled';
  }
  return '';
}

export function collectConversationRunningStates(workspaceState) {
  const states = new Map();
  (workspaceState?.projects || []).forEach((project) => {
    (project?.conversations || []).forEach((conversation) => {
      if (!conversation?.id) return;
      states.set(conversation.id, conversationHasRunningTask(conversation));
    });
  });
  return states;
}
