import { isTaskLive, isTaskSettled } from '../../../core/run-status.js';
import { taskCompletionNoticeKey } from '../../tasks/model/task-completion-notices.js';
import { compareConversationOrder, mergeConversationTasks } from './workspace-state.js';
import { timestampValue } from '../../../core/task-record.js';;

export const ACTIVITY_PAGE_SIZE = 20;

export function filterActivityEntries(entries, query, mode) {
  const needle = query.trim().toLowerCase();
  if (!needle) return entries;
  return entries.filter(({ project, conversation, task }) => (
    `${mode === 'bot' ? task?.title || '' : conversation.name || ''} ${project.name || ''}`
      .toLowerCase().includes(needle)
  ));
}

export function activityEntries(projects, notices = {}, mode = 'chat', workspaceProjects = [], activeConversationId = null) {
  const hasHistory = projects !== null;
  const workspaceByProject = new Map((workspaceProjects || []).map((project) => [project.id, project]));
  const byProject = new Map((projects || []).filter((project) => project.executionMode === mode).map((project) => [project.id, project]));
  for (const project of workspaceProjects || []) {
    if (project.executionMode === mode && !byProject.has(project.id)) byProject.set(project.id, { ...project, conversations: [] });
  }
  return [...byProject.values()].flatMap((project) => {
    const currentProject = workspaceByProject.get(project.id);
    const current = new Map((currentProject?.conversations || []).map((conversation) => [conversation.id, conversation]));
    const conversations = new Map((project.conversations || []).map((conversation) => [conversation.id, conversation]));
    for (const conversation of current.values()) {
      if (!conversations.has(conversation.id) && ((conversation.tasks || []).some(isTaskLive)
        || (hasHistory && mode === 'chat' && conversation.id === activeConversationId))) conversations.set(conversation.id, conversation);
    }
    return [...conversations.values()].flatMap((summary) => {
      const live = current.get(summary.id);
      const conversation = live ? { ...summary, ...live, tasks: mergeConversationTasks(summary.tasks, live.tasks) } : summary;
      const tasks = (conversation.tasks || []).flatMap((task) => {
        const taskId = task.taskId || task.task_id || task.id;
        if (!taskId || (mode === 'chat' && !isTaskSettled(task))
          || (mode === 'bot' && !isTaskSettled(task) && !isTaskLive(task))) return [];
        const completedAt = timestampValue(task.completedAt || task.completed_at)
          || timestampValue(task.updatedAt || task.updated_at)
          || timestampValue(task.createdAt || task.created_at);
        const sortTime = isTaskLive(task) ? timestampValue(task.createdAt || task.created_at) || completedAt : completedAt;
        return [{
          project, conversation, task, taskId, completedAt, sortTime,
          unread: Boolean(notices[taskCompletionNoticeKey(conversation.id, taskId)]),
        }];
      }).sort((a, b) => b.sortTime - a.sortTime || String(a.taskId).localeCompare(String(b.taskId)));
      if (mode === 'bot') return tasks;
      if (!tasks.length) return (conversation.id === activeConversationId || (conversation.tasks || []).some(isTaskLive)) ? [{
        project, conversation, task: null, taskId: '', completedAt: 0,
        sortTime: (conversation.tasks || []).filter(isTaskLive).reduce((latest, task) => Math.max(latest,
          timestampValue(task.createdAt || task.created_at)), 0) || timestampValue(conversation.updatedAt || conversation.createdAt), unread: false,
      }] : [];
      return [{ ...tasks[0], unread: tasks.some((entry) => entry.unread) }];
    });
  }).sort((a, b) => (mode === 'chat' ? compareConversationOrder(a.conversation, b.conversation) : b.sortTime - a.sortTime)
    || String(a.conversation.id).localeCompare(String(b.conversation.id))
    || String(a.taskId).localeCompare(String(b.taskId)));
}
