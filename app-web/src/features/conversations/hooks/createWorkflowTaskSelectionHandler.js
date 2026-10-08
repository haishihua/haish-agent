import { saveLastLocation } from '../model/last-location.js';
import { clearTaskCompletionNotice } from '../../tasks/model/task-completion-notices.js';

export function createWorkflowTaskSelectionHandler(ctx) {
  return async (projectId, targetConversationId, task) => {
    const taskId = task?.taskId || task?.task_id || task?.id;
    if (!targetConversationId || !taskId) return;
    const pending = ctx.getRuntime(targetConversationId)?.taskRuntimeState?.pendingTask;
    if (pending && (pending.taskId || pending.id) === taskId) {
      // A local placeholder has no REST task resource until confirmed.
      ctx.setViewedWorkflowTask(null);
      await ctx.handleSelectConversation(projectId, targetConversationId);
      return;
    }
    ctx.setTaskCompletionNotices((current) => clearTaskCompletionNotice(current, targetConversationId, taskId));
    ctx.setViewedWorkflowTask({ projectId, taskId });
    saveLastLocation(window.localStorage, ctx.ownerIdRef.current, 'workflow', { projectId, taskId });
    await ctx.handleSelectConversation(projectId, targetConversationId);
    try {
      await ctx.restoreLatestTaskRuntime(taskId, {
        targetConversationId,
        isCurrentActivation: () => ctx.conversationIdRef.current === targetConversationId,
      });
    } catch (error) {
      if (error?.status !== 404) throw error;
      ctx.removeMissingTask(targetConversationId, taskId);
      ctx.showToast('error', 'Task no longer exists. Removed the stale entry.');
    }
  };
}
