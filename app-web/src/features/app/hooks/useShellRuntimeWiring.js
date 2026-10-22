import { useConversationBootstrap } from '../../conversations/hooks/useConversationBootstrap.js';
import { useConversationListPolling } from '../../conversations/hooks/useConversationListPolling.js';
import { useTaskRuntimePolling } from '../../tasks/hooks/useTaskRuntimePolling.js';
import { findConversationById } from '../../conversations/model/workspace-state.js';

/**
 * AppShell 的三处运行时装配（每个都只是把 shell 的 state / ref 对齐到对应 hook 的入参）：
 * - 首次加载：项目 / 会话同步；
 * - 侧边栏列表轮询；
 * - 当前显示会话的任务轮询。
 * 放在一起是为了让「哪个 poller 需要哪些 shell 状态」只有一处答案，AppShell 不再逐个展开。
 */
export function useShellConversationBootstrap({
  activationApiRef,
  buildWorkspaceStateFromProjects,
  ownerIdRef,
  setConversationError,
  setConversationReady,
  setOwnerId,
  setWorkspaceLoading,
  setWorkspaceState,
  setViewedWorkflowTask,
}) {
  useConversationBootstrap({
    activationApiRef,
    buildWorkspaceStateFromProjects,
    ownerIdRef,
    setConversationError,
    setConversationReady,
    setOwnerId,
    setWorkspaceLoading,
    setWorkspaceState,
    setViewedWorkflowTask,
  });
}

export function useShellConversationListPolling({
  workspaceState,
  conversationId,
  conversationIdRef,
  directorySelectionApiRef,
  draftConversationRef,
  conversationReady,
  settingsMode,
  viewMode,
  replaceWorkspaceModeFromProjects,
  setWorkspaceState,
}) {
  useConversationListPolling({
    activeConversationExecutionMode: findConversationById(workspaceState, conversationId)?.executionMode || null,
    conversationIdRef,
    directorySelectionApiRef,
    draftConversationRef,
    enabled: conversationReady && !settingsMode,
    executionMode: viewMode === 'chat' ? 'chat' : 'bot',
    replaceWorkspaceModeFromProjects,
    setWorkspaceState,
  });
}

export function useShellTaskRuntimePolling({
  conversationId,
  conversationIdRef,
  currentConversationActive,
  applyContextUsage,
  fetchTaskRuntimeDetail,
  fetchTaskRuntimeBatch,
  getRuntime,
  notifyTaskComplete,
  panelWorkspaceState,
  removeMissingTask,
  restoreLatestTaskRuntime,
  setWorkspaceState,
}) {
  useTaskRuntimePolling({
    conversationId,
    conversationIdRef,
    currentConversationActive,
    applyContextUsage,
    fetchTaskRuntimeDetail,
    fetchTaskRuntimeBatch,
    getRuntime,
    notifyTaskComplete,
    panelWorkspaceState,
    removeMissingTask,
    restoreLatestTaskRuntime,
    setWorkspaceState,
  });
}
