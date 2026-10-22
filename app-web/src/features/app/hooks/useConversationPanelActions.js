import { useMemo } from 'react';
import { clearConversationCompletionNotices } from '../../tasks/model/task-completion-notices.js';

/**
 * 会话面板（侧边栏）那一整组动作的装配。
 * 面板只拿成型的回调：`handle*` 失败怎么打 toast、删项目后要清掉哪些完成通知、
 * 删会话后要不要把它的通知标成已读，这些细节都留在这里，JSX 里不再展开。
 */
export function useConversationPanelActions({
  workspaceState,
  viewMode,
  setConversationPanelCollapsed,
  setTaskCompletionNotices,
  markConversationTaskCompletionsViewed,
  showToast,
  handleAddProject,
  handleSelectProject,
  handleToggleProject,
  handleRemoveProject,
  handleAddConversation,
  handleSelectConversation,
  handleSelectWorkflowTask,
  handleToggleConversationTasks,
  handleToggleProjectConversations,
  handleDeleteConversation,
  handleRenameConversation,
  handlePinConversation,
  handlePinProject,
  handleReorderConversations,
  handleReorderProjects,
}) {
  return useMemo(() => {
    const reportFailure = (label, error) => {
      console.error(label, error);
      showToast('error', String(error?.message || error));
    };
    return {
      onToggleCollapsed: () => setConversationPanelCollapsed((collapsed) => !collapsed),
      onAddProject: () => {
        handleAddProject().catch((error) => reportFailure('project add failed', error));
      },
      onSelectProject: (projectId) => {
        handleSelectProject(projectId).catch((error) => reportFailure('project select failed', error));
      },
      onToggleProject: handleToggleProject,
      onRemoveProject: (projectId) => {
        const project = workspaceState.projects.find((item) => item.id === projectId);
        const executionMode = viewMode === 'chat' ? 'chat' : 'bot';
        const conversationIds = (project?.conversations || [])
          .filter((item) => item.executionMode === executionMode)
          .map((item) => item.id);
        return handleRemoveProject(projectId)
          .then(() => {
            setTaskCompletionNotices((current) => conversationIds.reduce(
              (next, targetConversationId) => clearConversationCompletionNotices(next, targetConversationId),
              current,
            ));
          });
      },
      onAddConversation: (projectId) => {
        handleAddConversation(projectId).catch((error) => reportFailure('conversation add failed', error));
      },
      onSelectConversation: (projectId, nextConversationId) => {
        handleSelectConversation(projectId, nextConversationId)
          .catch((error) => reportFailure('conversation select failed', error));
      },
      onSelectTask: (projectId, targetConversationId, task) => {
        handleSelectWorkflowTask(projectId, targetConversationId, task)
          .catch((error) => reportFailure('task select failed', error));
      },
      onToggleConversationTasks: handleToggleConversationTasks,
      onToggleProjectConversations: handleToggleProjectConversations,
      onDeleteConversation: (projectId, nextConversationId) => (
        handleDeleteConversation(projectId, nextConversationId)
          .then(() => markConversationTaskCompletionsViewed(nextConversationId))
      ),
      onRenameConversation: handleRenameConversation,
      onPinConversation: handlePinConversation,
      onPinProject: handlePinProject,
      onReorderConversations: handleReorderConversations,
      onReorderProjects: handleReorderProjects,
    };
  }, [
    workspaceState, viewMode, setConversationPanelCollapsed, setTaskCompletionNotices,
    markConversationTaskCompletionsViewed, showToast, handleAddProject, handleSelectProject,
    handleToggleProject, handleRemoveProject, handleAddConversation, handleSelectConversation,
    handleSelectWorkflowTask, handleToggleConversationTasks, handleToggleProjectConversations,
    handleDeleteConversation, handleRenameConversation, handlePinConversation, handlePinProject,
    handleReorderConversations, handleReorderProjects,
  ]);
}
