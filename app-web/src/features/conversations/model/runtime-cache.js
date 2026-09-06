import { isTaskActuallyActive } from './workspace-state.js';

export function evictInactiveRuntimes(runtimes, currentId, keep = 3) {
  const inactive = [...runtimes].filter(([id, runtime]) => (
    id !== currentId && !runtime.busy && !runtime.activeRunId && !runtime.fetchController
    && !runtime.taskRuntimeState?.pendingTask
    && !Object.values(runtime.taskRuntimeState?.tasksById || {}).some(isTaskActuallyActive)
  )).sort((a, b) => (b[1].lastAccessedAt || 0) - (a[1].lastAccessedAt || 0));
  const evicted = new Set();
  for (const [id] of inactive.slice(keep)) {
    runtimes.delete(id);
    evicted.add(id);
  }
  return evicted;
}

export function releaseWorkspaceRuntimeDetails(state, conversationIds) {
  if (!conversationIds.size) return state;
  return {
    ...state,
    projects: state.projects.map((project) => ({
      ...project,
      conversations: project.conversations.map((conversation) => conversationIds.has(conversation.id) ? {
        ...conversation,
        tasks: (conversation.tasks || []).map((task) => ({
          id: task.id,
          taskId: task.taskId,
          conversationId: task.conversationId,
          title: task.title,
          description: task.description,
          status: task.status,
          stage: task.stage,
          createdAt: task.createdAt,
          updatedAt: task.updatedAt,
          completedAt: task.completedAt,
          executionMode: task.executionMode,
          runtimeHydrated: false,
        })),
      } : conversation),
    })),
  };
}
