import React from 'react';
import {
  findConversationById,
  isTaskActuallyActive,
  taskUpdatedTimestamp,
  workspaceStateWithConversationRuntimeTask,
} from '../../conversations/model/workspace-state.js';
import { taskSummaryToRuntimeTask } from '../model/task-runtime.js';
import { terminalTaskNoticeStatus } from '../model/task-completion-notices.js';
import { startPolling } from '../../../shared/lib/polling.js';

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
  fetchTaskRuntimeBatch,
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
      return restoreLatestTaskRuntime(activeTaskId, {
        targetConversationId: conversationId,
        isCurrentActivation: isCurrent,
      }).then((task) => {
        if (cancelled) return;
        if (terminalTaskNoticeStatus(task)) notifyTaskComplete(conversationId, activeTaskId, task);
      }).catch((error) => {
        if (cancelled) return;
        if (error?.status === 404) removeMissingTask(conversationId, activeTaskId);
        else if (!cancelled) console.warn('task poll failed', error);
        throw error;
      });
    };
    const stopPolling = startPolling(refresh, { interval: 2000 });
    return () => {
      cancelled = true;
      stopPolling();
    };
  // Runtime functions are render-stable controllers.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTaskId, conversationId]);

  React.useEffect(() => {
    if (!backgroundKey) return undefined;
    let cancelled = false;
    const controller = new AbortController();
    const refresh = async () => {
      const groups = new Map();
      for (const target of backgroundTargets) {
        if (getRuntime(target.conversationId)?.activeRunId) continue;
        const ids = groups.get(target.conversationId) || [];
        ids.push(target.taskId);
        groups.set(target.conversationId, ids);
      }
      const queue = [...groups];
      const updates = [];
      let failed = false;
      const worker = async () => {
        while (queue.length && !cancelled) {
          const [targetConversationId, taskIds] = queue.shift();
          try {
            const details = await fetchTaskRuntimeBatch(targetConversationId, taskIds, controller.signal);
            for (const detail of details) updates.push({ targetConversationId, detail });
          } catch (error) {
            if (error?.status === 404 && !cancelled) {
              // Resolve missing tasks individually; one deleted task must not block its siblings.
              for (const taskId of taskIds) {
                if (cancelled) break;
                try {
                  const detail = await fetchTaskRuntimeDetail(taskId);
                  if (detail) updates.push({ targetConversationId, detail });
                } catch (detailError) {
                  if (!cancelled && detailError?.status === 404) removeMissingTask(targetConversationId, taskId);
                  else failed = true;
                }
              }
              continue;
            }
            failed = true;
            if (!cancelled) console.warn('background task poll failed', error);
          }
        }
      };
      await Promise.all([worker(), worker()]);
      if (cancelled) return;
      if (updates.length) {
        setWorkspaceState((previousState) => {
          let state = previousState;
          for (const { targetConversationId, detail } of updates) {
            const taskId = detail.normalizedTask.task_id;
            const conversation = findConversationById(state, targetConversationId);
            const previous = (conversation?.tasks || []).find(
              (task) => (task.taskId || task.id) === taskId,
            ) || null;
            const next = taskSummaryToRuntimeTask(detail.normalizedTask, previous?.imageAttachments || []);
            if (previous && taskUpdatedTimestamp(previous) === taskUpdatedTimestamp(next)
              && previous.status === next.status && previous.stage === next.stage) continue;
            // The sidebar only needs summaries; full event history lives in the bounded cache.
            next.answerText = '';
            next.workflowRun = null;
            next.workflowSnapshot = null;
            state = workspaceStateWithConversationRuntimeTask(state, targetConversationId, next);
          }
          return state;
        });
        for (const { targetConversationId, detail } of updates) {
          if (terminalTaskNoticeStatus(detail.normalizedTask)) {
            notifyTaskComplete(targetConversationId, detail.normalizedTask.task_id, detail.normalizedTask);
          }
        }
      }
      if (failed) throw new Error('Background polling incomplete');
    };
    const stopPolling = startPolling(refresh, { interval: 5000 });
    return () => {
      cancelled = true;
      controller.abort();
      stopPolling();
    };
  // The key restarts polling only when active remote work changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backgroundKey]);
}
