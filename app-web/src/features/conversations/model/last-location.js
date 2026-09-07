import { buildOwnerScopedStorageKey } from '../../../shared/api/client.js';

const STORAGE_KEY = 'haish.last-location.v1';

export function readLastLocation(storage, ownerId) {
  try {
    const key = buildOwnerScopedStorageKey(STORAGE_KEY, ownerId);
    const value = key ? JSON.parse(storage.getItem(key)) : null;
    return value && ['chat', 'workflow'].includes(value.mode) ? value : null;
  } catch { return null; }
}

export function saveLastLocation(storage, ownerId, mode, task) {
  const key = buildOwnerScopedStorageKey(STORAGE_KEY, ownerId);
  if (!key) return;
  try {
    storage.setItem(key, JSON.stringify({
      mode: mode === 'workflow' ? 'workflow' : 'chat',
      workflowTask: task?.projectId && task?.taskId ? { projectId: task.projectId, taskId: task.taskId } : null,
    }));
  } catch (error) { console.warn('Failed to save last location:', error); }
}

export function resolveStoredWorkflowTask(state, location) {
  const selection = location?.workflowTask;
  const project = state.projects.find((item) => item.id === selection?.projectId && item.executionMode === 'bot');
  if (!project) return null;
  for (const conversation of project.conversations || []) {
    const task = (conversation.tasks || []).find((item) => (item.taskId || item.task_id || item.id) === selection.taskId);
    if (task) return { projectId: project.id, taskId: selection.taskId, conversationId: conversation.id };
  }
  return null;
}
