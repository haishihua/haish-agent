// Resolve the entry selection from summaries plus fresher in-memory runtime data.
export function defaultWorkflowTask(workspace, getRuntime, updatedTimestamp) {
  const candidates = [];
  for (const project of workspace.projects || []) {
    for (const conversation of project.conversations || []) {
      if ((conversation.executionMode || project.executionMode) !== 'bot') continue;
      const state = getRuntime(conversation.id)?.taskRuntimeState;
      const tasks = new Map((conversation.tasks || []).map(task => [task.taskId || task.task_id || task.id, task]));
      for (const task of Object.values(state?.tasksById || {})) tasks.set(task.taskId || task.task_id || task.id, task);
      if (state?.pendingTask) {
        const task = state.pendingTask;
        tasks.set(task.taskId || task.task_id || task.id, task);
      }
      for (const [id, task] of tasks) {
        if (!id) continue;
        candidates.push({ projectId: project.id, conversationId: conversation.id, task,
          active: ['running', 'queued', 'pending', 'starting', 'waiting', 'paused'].includes(task.status),
          time: Number(updatedTimestamp(task)) || Date.parse(updatedTimestamp(task)) || 0 });
      }
    }
  }
  candidates.sort((a, b) => Number(b.active) - Number(a.active) || b.time - a.time);
  return candidates[0] || null;
}
