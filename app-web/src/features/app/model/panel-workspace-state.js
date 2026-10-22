import {
  findConversationById,
  mergeConversationTasks,
  normalizeWorkspaceOrdering,
  taskUpdatedTimestamp,
} from '../../conversations/model/workspace-state.js';

/**
 * 会话面板用的工作区投影：把当前会话的本地运行态任务合并进服务端目录那份拷贝。
 * `withDefaultExpansion` 会在下游重算 expanded，这里只负责合并任务与 updatedAt。
 */
export function panelWorkspaceStateFor({ workspaceState, conversationId, quests }) {
  return normalizeWorkspaceOrdering({
    ...workspaceState,
    activeConversationId: workspaceState.activeConversationId,
    projects: workspaceState.projects.map((project) => ({
      ...project,
      conversations: project.conversations.map((item) => (
        item.id === conversationId
          ? {
              ...item,
              tasks: mergeConversationTasks(item.tasks, quests),
              // expanded is recomputed downstream by withDefaultExpansion from
              // (userExpanded ?? isActive). We only need to merge tasks here.
              updatedAt: quests.reduce((latest, task) => Math.max(latest, taskUpdatedTimestamp(task)), item.updatedAt || 0),
            }
          : item
      )),
    })),
  });
}

/**
 * 只显示当前模式（chat / bot）的项目与会话，并且只有当前会话也属于这个模式时才算选中。
 * 两个模式共用一份工作区状态，侧边栏不能把另一个模式的东西漏出来。
 */
export function visiblePanelWorkspaceStateFor({ panelWorkspaceState, conversationId, viewMode }) {
  const mode = viewMode === 'chat' ? 'chat' : 'bot';
  return {
    ...panelWorkspaceState,
    activeConversationId: findConversationById(panelWorkspaceState, conversationId)?.executionMode === mode
      ? conversationId
      : null,
    projects: panelWorkspaceState.projects
      .filter((project) => project.executionMode === mode)
      .map((project) => ({
        ...project,
        conversations: project.conversations.filter(
          (conversation) => conversation.executionMode === mode,
        ),
      })),
  };
}
