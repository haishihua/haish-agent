import { taskFinalOutputText } from '../../tasks/model/runtime-events.js';
import { createGoalCommandHandler } from './createGoalCommandHandler.js';
import { createConversationCrudHandlers } from './conversation-handlers/crud.js';
import { createConversationMessageHandlers } from './conversation-handlers/messages.js';
import { createConversationRestoreHandlers } from './conversation-handlers/restore.js';

// The AbortController ref is shared across renders; so is its request owner.
const conversationLoadRequests = new WeakMap();

export function createConversationHandlers(ctx) {
  const {
    API_BASE,
    activateConversationDetail,
    activateConversationShell,
    applyConversationSnapshot,
    apiFetch,
    buildApiHeaders,
    buildDeployRequest,
    conversationReorderChainsRef,
    conversationReorderVersionsRef,
    projectReorderChainRef,
    projectReorderVersionRef,
    settingsMode,
    canStartDeployForConversation,
    clearDraftConversationState,
    conversationDetailAbortRef,
    conversationError = '',
    conversationId,
    conversationIdRef,
    createDefaultProject,
    draftConversationRef,
    dropMissingConversation,
    fetchConversationDetail,
    findConversationById,
    findProjectByConversationId,
    getRuntime,
    invalidateConversationActivation,
    isConversationActivationCurrent,
    modeLocationRef,
    normalizeWorkspaceOrdering,
    openDraftConversation,
    replaceWorkspaceModeFromProjects,
    setActiveTab,
    setConversationError = () => {},
    setSettingsMode,
    setHollow,
    setViewMode,
    setWorkspaceState,
    showToast,
    startDeploy,
    executeQuest,
    stopConversationRuntimeBeforeDelete,
    taskUpdatedTimestamp,
    viewModeRef,
    workspaceState,
    workspaceStateWithConversationDetail,
  } = ctx;

  // restore ⇄ crud 互相调用，装配期互不可见：用一次延迟绑定打通，点击时两者都是成品。
  let crudHandlers = null;
  const addConversation = (projectId) => crudHandlers.handleAddConversation(projectId);

  const restoreHandlers = createConversationRestoreHandlers({
    activateConversationDetail,
    activateConversationShell,
    clearDraftConversationState,
    conversationDetailAbortRef,
    conversationError,
    conversationId,
    conversationIdRef,
    draftConversationRef,
    dropMissingConversation,
    fetchConversationDetail,
    findConversationById,
    findProjectByConversationId,
    getRuntime,
    invalidateConversationActivation,
    isConversationActivationCurrent,
    modeLocationRef,
    normalizeWorkspaceOrdering,
    openDraftConversation,
    setActiveTab,
    setConversationError,
    setSettingsMode,
    setViewMode,
    setWorkspaceState,
    settingsMode,
    showToast,
    taskUpdatedTimestamp,
    viewModeRef,
    workspaceState,
    addConversation,
    conversationLoadRequests,
  });

  crudHandlers = createConversationCrudHandlers({
    API_BASE,
    activateConversationDetail,
    apiFetch,
    applyConversationSnapshot,
    buildApiHeaders,
    conversationId,
    conversationIdRef,
    conversationReorderChainsRef,
    conversationReorderVersionsRef,
    createDefaultProject,
    fetchConversationDetail,
    findConversationById,
    invalidateConversationActivation,
    isConversationActivationCurrent,
    normalizeWorkspaceOrdering,
    openDraftConversation,
    projectReorderChainRef,
    projectReorderVersionRef,
    replaceWorkspaceModeFromProjects,
    setWorkspaceState,
    showToast,
    stopConversationRuntimeBeforeDelete,
    viewModeRef,
    workspaceState,
    workspaceStateWithConversationDetail,
    selectConversation: restoreHandlers.handleSelectConversation,
  });

  const messageHandlers = createConversationMessageHandlers({
    API_BASE,
    activateConversationDetail,
    apiFetch,
    buildApiHeaders,
    buildDeployRequest,
    canStartDeployForConversation,
    executeQuest,
    getRuntime,
    setWorkspaceState,
    showToast,
    startDeploy,
    workspaceStateWithConversationDetail,
    ctx,
  });

  function handleOpenTaskReport(task) {
    const restoredMode = task?.executionMode === 'bot' ? 'workflow' : 'chat';
    viewModeRef.current = restoredMode;
    setViewMode(restoredMode);
    const taskId = task?.taskId || task?.task_id || task?.id || null;
    const workflowNodes = Object.entries(task?.workflowRun?.nodes || {}).map(([nodeId, node]) => (
      `${node?.success === false ? '✕' : '✓'} ${nodeId}: ${node?.summary || node?.error || node?.status || ''}`
    ));
    const result = taskFinalOutputText(
      task,
      task?.answerText || workflowNodes.join('\n') || task?.error || '',
    );
    if (!result) return;
    setHollow({
      title: task?.title || 'Final Report',
      result,
      taskId,
      // 只有工作流任务能「以这份产出为上下文开新任务」：对话框底部的按钮靠它出现，
      // 点下去把这枚引用挂到输入框的标签上（只带引用，报告正文由服务端现取）。
      contextSource: task?.executionMode === 'bot' && taskId
        ? {
          taskId,
          title: task?.title || '',
          conversationId: task?.conversationId || task?.conversation_id || null,
        }
        : null,
    });
  }

  return {
    handleGoalCommand: createGoalCommandHandler({ ...ctx, createConversationInProject: crudHandlers.createConversationInProject }),
    handleSelectConversation: restoreHandlers.handleSelectConversation,
    handleConversationRemoved: restoreHandlers.handleConversationRemoved,
    handleSelectProject: restoreHandlers.handleSelectProject,
    handleToggleProject: restoreHandlers.handleToggleProject,
    handleToggleConversationTasks: restoreHandlers.handleToggleConversationTasks,
    handleToggleProjectConversations: restoreHandlers.handleToggleProjectConversations,
    handlePinConversation: crudHandlers.handlePinConversation,
    handleReorderConversations: crudHandlers.handleReorderConversations,
    handlePinProject: crudHandlers.handlePinProject,
    handleRenameProject: crudHandlers.handleRenameProject,
    handleReorderProjects: crudHandlers.handleReorderProjects,
    createConversationInProject: crudHandlers.createConversationInProject,
    handleAddConversation: crudHandlers.handleAddConversation,
    handleAddProject: crudHandlers.handleAddProject,
    handleDeleteConversation: crudHandlers.handleDeleteConversation,
    handleRenameConversation: crudHandlers.handleRenameConversation,
    handleRemoveProject: crudHandlers.handleRemoveProject,
    handleToggleViewMode: restoreHandlers.handleToggleViewMode,
    handleOpenTaskReport,
    handleRetryTask: messageHandlers.handleRetryTask,
    handleForkMessage: messageHandlers.handleForkMessage,
  };
}
