import React from 'react';
import {
  findConversationById,
  isTaskActuallyActive,
  taskUpdatedTimestamp,
  workspaceStateWithConversationRuntimeTask,
} from '../../conversations/model/workspace-state.js';
import { taskDetailToRuntimeTask } from '../model/task-runtime.js';
import { terminalTaskNoticeStatus } from '../model/task-completion-notices.js';

function latestActiveTaskId(tasks) {
  let latest = null;
  for (const task of tasks || []) {
    if (!isTaskActuallyActive(task)) continue;
    if (!latest || taskUpdatedTimestamp(task) > taskUpdatedTimestamp(latest)) latest = task;
  }
  return latest?.taskId || latest?.id || null;
}

export function useTaskRuntimePolling({
  conversationId,
  conversationIdRef,
  currentConversationActive,
  fetchTaskRuntimeDetail,
  getRuntime,
  notifyTaskComplete,
  panelWorkspaceState,
  removeMissingTask,
  restoreLatestTaskRuntime,
  setWorkspaceState,
}) {
  const activeTaskId = React.useMemo(() => {
    if (!currentConversationActive) return null;
    for (const project of panelWorkspaceState.projects || []) {
      const conversation = project.conversations.find((item) => item.id === conversationId);
      if (conversation) return latestActiveTaskId(conversation.tasks);
    }
    return null;
  }, [conversationId, currentConversationActive, panelWorkspaceState]);

  const backgroundTargets = React.useMemo(() => {
    const targets = [];
    for (const project of panelWorkspaceState.projects || []) {
      for (const conversation of project.conversations || []) {
        if (!conversation?.id || conversation.id === conversationId) continue;
        for (const task of conversation.tasks || []) {
          if (!isTaskActuallyActive(task)) continue;
          const taskId = task.taskId || task.id;
          if (taskId) targets.push({ conversationId: conversation.id, taskId });
        }
      }
    }
    return targets;
  }, [conversationId, panelWorkspaceState]);
  const backgroundKey = backgroundTargets
    .map((target) => `${target.conversationId}:${target.taskId}`)
    .sort()
    .join('|');

  React.useEffect(() => {
    if (!activeTaskId || getRuntime(conversationId)?.activeRunId) return undefined;
    let cancelled = false;
    const isCurrent = () => !cancelled && conversationIdRef.current === conversationId;
    const refresh = () => {
      restoreLatestTaskRuntime(activeTaskId, {
        targetConversationId: conversationId,
        isCurrentActivation: isCurrent,
      }).then((task) => {
        if (terminalTaskNoticeStatus(task)) notifyTaskComplete(conversationId, activeTaskId, task);
      }).catch((error) => {
        if (error?.status === 404) removeMissingTask(conversationId, activeTaskId);
        else if (!cancelled) console.warn('task poll failed', error);
      });
    };
    refresh();
    const timer = window.setInterval(refresh, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  // Runtime functions are render-stable controllers.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTaskId, conversationId]);

  React.useEffect(() => {
    if (!backgroundKey) return undefined;
    let cancelled = false;
    const refresh = () => {
      backgroundTargets.forEach(({ conversationId: targetConversationId, taskId }) => {
        fetchTaskRuntimeDetail(taskId).then((detail) => {
          if (cancelled || !detail) return;
          setWorkspaceState((state) => {
            const conversation = findConversationById(state, targetConversationId);
            const previous = (conversation?.tasks || []).find(
              (task) => (task.taskId || task.id) === taskId,
            ) || null;
            const next = taskDetailToRuntimeTask(detail.normalizedTask, previous);
            return workspaceStateWithConversationRuntimeTask(state, targetConversationId, next);
          });
          if (terminalTaskNoticeStatus(detail.normalizedTask)) {
            notifyTaskComplete(targetConversationId, taskId, detail.normalizedTask);
          }
        }).catch((error) => {
          if (error?.status === 404) removeMissingTask(targetConversationId, taskId);
          else if (!cancelled) console.warn('background task poll failed', error);
        });
      });
    };
    refresh();
    const timer = window.setInterval(refresh, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  // The key restarts polling only when active remote work changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backgroundKey]);
}
