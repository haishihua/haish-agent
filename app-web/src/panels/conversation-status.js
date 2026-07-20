// @haish-esm
// Pure helpers for conversation / task running state (no React).

export function conversationHasRunningTask(conversation) {
  const tasks = Array.isArray(conversation?.tasks) ? conversation.tasks : [];
  return tasks.some((task) => {
    const status = String(task?.status || '').toLowerCase();
    if (status !== 'running' && status !== 'queued') return false;
    if (task?.completedAt || task?.completed_at) return false;
    const answer = task?.answerText ?? task?.answer_text;
    return !(typeof answer === 'string' && answer.trim());
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
