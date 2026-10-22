import { normalizeWorkflowSettings } from '../../workflow/model/workflow-catalog.js';
import { runtimeTaskToQuest } from '../../tasks/model/task-runtime.js';
import { pendingTaskToQuest } from '../../chat/model/chat-timeline.js';
import { pendingTaskRuntimeIds } from '../../tasks/model/task-runtime-paging.js';

/**
 * 工作流选择器里的选项：只留启用、可执行、不是草稿的目录项。
 * 默认工作流的兜底在 AppShell（还要看 workflowSettingsDraft.default_workflow_id）。
 */
export function workflowOptionsFromDraft(workflowSettingsDraft) {
  const normalized = normalizeWorkflowSettings(workflowSettingsDraft);
  return [...normalized.presets, ...normalized.custom]
    .filter((item) => item.enabled !== false && item.executable && !item.draft)
    .map((item) => ({
      id: item.workflow_id,
      label: item.display_name || item.workflow_id,
      description: item.description || '',
      canUploadDocuments: item.can_upload_documents === true, nodes: item.nodes,
    }));
}

/** 当前运行态代表的「步骤」列表：已确认的任务 + 还没被服务端接下的那一轮。 */
export function questsFromRuntimeState(taskRuntimeState) {
  const confirmedTasks = taskRuntimeState.taskOrder
    .map((taskId) => taskRuntimeState.tasksById[taskId])
    .filter(Boolean)
    .map(runtimeTaskToQuest);
  return taskRuntimeState.pendingTask
    ? [...confirmedTasks, pendingTaskToQuest(taskRuntimeState.pendingTask)]
    : confirmedTasks;
}

/** 页面上正在跑的那一条任务：优先 active，其次 pending（还没接下时没有运行态），最后是最新一条。 */
export function runtimeCurrentTaskFor(taskRuntimeState) {
  if (taskRuntimeState.activeTaskId && taskRuntimeState.tasksById[taskRuntimeState.activeTaskId]) {
    return taskRuntimeState.tasksById[taskRuntimeState.activeTaskId];
  }
  if (taskRuntimeState.pendingTask) {
    return null;
  }
  const latestTaskId = taskRuntimeState.taskOrder[taskRuntimeState.taskOrder.length - 1];
  return latestTaskId ? taskRuntimeState.tasksById[latestTaskId] || null : null;
}

/** 输入框占位里显示的那句「正在跑什么」。 */
export function activeTaskTextFor(taskRuntimeState) {
  const activeTaskId = taskRuntimeState.activeTaskId;
  if (activeTaskId && taskRuntimeState.tasksById[activeTaskId]?.title) {
    return taskRuntimeState.tasksById[activeTaskId].title;
  }
  if (taskRuntimeState.pendingTask?.title) {
    return taskRuntimeState.pendingTask.title;
  }
  return '';
}

// Older turns keep their summary until the user scrolls up to them, so the
// conversation no longer replays every task event log on open.
export function pendingEarlierTaskRuntimeIdsFor(taskRuntimeState) {
  return pendingTaskRuntimeIds(taskRuntimeState.taskOrder, taskRuntimeState.tasksById);
}
