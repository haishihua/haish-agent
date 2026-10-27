import { API_BASE } from '../../../shared/api/base.js';
import { DEFAULT_SESSION_NAME, apiFetch, buildApiHeaders, parseResponseMessage } from '../../../shared/api/client.js';
import { copySettingsResponse } from '../../../shared/lib/settings-sync.js';
import { staleAgentCatalog } from '../../agents/model/agent-catalog-loading.js';
import {
  APP_DEFAULT_AGENT_OPTIONS,
  agentCatalogFromSettings,
  createDefaultCustomAgentPayload,
  normalizeAgentSettings,
  withAlwaysAllowedAgentTools,
} from '../../agents/model/agent-settings.js';
import { createComposerHandlers } from '../../chat/hooks/createComposerHandlers.js';
import { eventDeltaText, stripChatImageAugmentation } from '../../chat/model/chat-text.js';
import { appendAnswerDelta, appendChatProgressText, getChatProgressLine } from '../../chat/model/chat-timeline.js';
import {
  contextUsageFromConversationDetail,
  estimateContextUsageFromConversationDetail,
  latestContextUsageFromTasks,
  loadStoredContextUsage,
  normalizeContextUsage,
} from '../../chat/model/context-usage.js';
import { getToolResponseTraceStatus } from '../../chat/model/tool-trace-status.js';
import { createConversationActivationHandlers } from '../../conversations/hooks/createConversationActivationHandlers.js';
import { createConversationHandlers } from '../../conversations/hooks/createConversationHandlers.js';
import { createConversationRuntime } from '../../conversations/hooks/createConversationRuntime.js';
import { createDraftConversationHandlers } from '../../conversations/hooks/createDraftConversationHandlers.js';
import { createWorkflowTaskSelectionHandler } from '../../conversations/hooks/createWorkflowTaskSelectionHandler.js';
import {
  chatImageFallbacksByTaskIdFromMessages,
  createDefaultProject,
  findConversationById,
  findProjectByConversationId,
  generateHexId,
  isDefaultConversationName,
  isTaskActuallyActive,
  mergeChatImageRefs,
  normalizeChatImageRefs,
  normalizeWorkspaceOrdering,
  setStoredConversationId,
  taskUpdatedTimestamp,
  timestampValue,
  titleFromTaskText,
  workspaceStateWithTouchedConversation,
} from '../../conversations/model/workspace-state.js';
import { createSettingsHandlers } from '../../settings/hooks/createSettingsHandlers.js';
import {
  applyMemorySettingsPayloadToRecords,
  applyToolsSettingsPayloadToRecords,
  buildMemorySettingsPayload,
  buildToolsSettingsPayload,
  getSelectedLlmConfig,
  llmProviderRequestPayload,
} from '../../settings/model/settings-payload.js';
import { SETTINGS_RECORDS_STORAGE_KEY, WEB_SEARCH_PROVIDER_OPTIONS } from '../../settings/model/settings-records.js';
import { createDeployHandlers } from '../../tasks/hooks/createDeployHandlers.js';
import { createTaskStreamHandlers } from '../../tasks/hooks/createTaskStreamHandlers.js';
import {
  CHAT_FINAL_FOLLOWUP_EVENT_TYPES,
  STREAM_EVENT_BATCH_MS,
  STREAM_IMMEDIATE_EVENT_TYPES,
  normalizeRuntimeEvent,
  normalizeRuntimeEvents,
  resolveProviderMeta,
  toDisplayText,
} from '../../tasks/model/runtime-events.js';
import { clearTaskCompletionNotice } from '../../tasks/model/task-completion-notices.js';
import { nextEarlierTaskRuntimeIds, pendingTaskRuntimeIds } from '../../tasks/model/task-runtime-paging.js';
import {
  applyTerminalTaskState,
  buildTaskRuntimeRecord,
  createEmptyTaskRuntimeState,
  createPendingTaskDraft,
  isTerminalTaskStatus,
  normalizeTaskStatus,
  sortTaskIdsForRestore,
  taskDetailToRuntimeTask,
  taskHasAssistantStreamContent,
  taskSummaryToRuntimeTask,
  upsertToolCall,
} from '../../tasks/model/task-runtime.js';
import { createDefaultCustomWorkflowPayload, normalizeWorkflowSettings, payloadForCustomWorkflow, workflowById } from '../../workflow/model/workflow-catalog.js';
import { conversationDetailToWorkspaceConversation, replaceWorkspaceModeFromProjects, workspaceStateWithConversationDetail } from '../model/workspace-runtime.js';

/**
 * AppShell 的 handlers 装配：把各个 create*Handlers / createConversationRuntime 工厂
 * 用同一份 ctx 组织起来。这里只做装配——不新增 state / effect / memo，所有入参由
 * AppShell（唯一的组合根）传进来，返回值再摊回组件作用域。
 */
export function useShellHandlers({
  activationApiRef, activeTab, agentContextKey, agentContextKeyRef,
  agentSettingsDraft, applyContextUsage, beginLlmSettingsWrite, beginToolsSettingsSave,
  busy, chatFinalizedTaskIdsRef, configSync, contextTask,
  conversationActivationSeqRef, conversationDetailAbortRef, conversationError, conversationId,
  conversationIdRef, conversationReady, conversationReorderChainsRef, conversationReorderVersionsRef,
  conversationSelectionPending, defaultAgentId, defaultWorkflowId, deployApiRef,
  draftApiRef, draftConversationIdsRef, draftConversationRef, draftFirstSendRef,
  draftServerCreateRef, llmProviderOptions, llmSettingsDraft, modeLocationRef,
  notifyTaskComplete, ownerIdRef, pendingCreatedDetailRef, projectReorderChainRef,
  projectReorderVersionRef, queuedDeploy, rekeyChatDraft, removeMissingTask,
  resetContextUsage, runtimeApiRef, runtimesRef, selectedConversationId,
  setActiveTab, setAgentCatalog, setAgentLoadState, setAgentRetry,
  setAgentSettingsDraft, setBusy, setComposerAttachment, setContextTask,
  setConversationAttachments, setConversationError, setConversationId, setConversationReady,
  setConversationRetryPending, setConversationStopState, setHollow, setLocalWorkspace,
  setQueuedDeploy, setSelectedWorkflowId, setSettingsConnectionStatus, setSettingsMode,
  setSettingsRecordsDraft, setSettingsSection, setShellSeeded, setSkillActionBusy,
  setTaskCompletionNotices, setTaskRuntimeState, setToast, setUploadState,
  setViewMode, setViewedWorkflowTask, setWorkflowSettingsDraft, setWorkspaceState,
  settingsApiRef, settingsMode, settingsRecordsDraft, skillInventoryCacheRef,
  skillInventoryKey, skillInventoryKeyRef, streamTargetConvIdRef, taskImageAttachmentsRef,
  taskRuntimeEventCacheRef, taskRuntimeFetchesRef, toastTimerRef, userCancelledTaskIdsRef,
  viewMode, viewModeRef, viewedWorkflowTask, workflowSettingsDraft,
  workspaceState,
}) {
  function updateSettingsConnectionStatus(updater) {
    setSettingsConnectionStatus((prev) => (typeof updater === 'function' ? updater(prev) : updater));
  }

  function persistStoredConversationId(nextConversationId) {
    setStoredConversationId(ownerIdRef.current, nextConversationId);
  }

  const {
    invalidateConversationActivation,
    isConversationActivationCurrent,
    isDraftConversationId,
    clearDraftConversationState,
    openDraftConversation,
    ensureServerConversationForActiveDraft,
    markDraftConversationKept,
    isDraftFirstSendInFlight,
    markDraftFirstSendInFlight,
    materializeDraftConversationForSend,
    fetchTaskRuntimeDetail,
    fetchTaskRuntimeBatch,
    restoreTaskRuntimes,
    restoreLatestTaskRuntime,
    cancelActiveTask,
    queueTaskInput,
    cancelActiveConversationTask,
    stopConversationRuntimeBeforeDelete,
  } = createDraftConversationHandlers({
    API_BASE,
    DEFAULT_SESSION_NAME,
    // Late-bound: activation / runtime factories below.
    applyConversationSnapshot: (...args) => activationApiRef.current.applyConversationSnapshot?.(...args),
    apiFetch,
    applyContextUsage,
    buildApiHeaders,
    chatFinalizedTaskIdsRef,
    conversationActivationSeqRef,
    conversationDetailAbortRef,
    conversationId,
    conversationIdRef,
    createConversationInProject: (...args) => createConversationInProject(...args),
    createDefaultProject,
    createEmptyTaskRuntimeState,
    detachActiveRunFromCurrentConversation: (...args) => activationApiRef.current.detachActiveRunFromCurrentConversation?.(...args),
    draftConversationIdsRef,
    draftConversationRef,
    draftFirstSendRef,
    draftServerCreateRef,
    flushRuntimeTasksToWorkspace: (...args) => runtimeApiRef.current.flushRuntimeTasksToWorkspace?.(...args),
    generateHexId,
    getRuntime: (...args) => runtimeApiRef.current.getRuntime?.(...args),
    isTaskActuallyActive,
    latestContextUsageFromTasks,
    mutateRuntime: (...args) => runtimeApiRef.current.mutateRuntime?.(...args),
    normalizeWorkspaceOrdering,
    normalizeRuntimeEvents,
    pendingCreatedDetailRef,
    rekeyChatDraft,
    resetContextUsage,
    runtimesRef,
    setComposerAttachment,
    setConversationAttachments,
    setConversationError,
    setConversationId,
    setConversationReady,
    setLocalWorkspace,
    setStoredConversationId: persistStoredConversationId,
    setUploadState,
    setWorkspaceState,
    taskDetailToRuntimeTask,
    taskRuntimeEventCacheRef,
    taskRuntimeFetchesRef,
    taskUpdatedTimestamp,
    updateTaskRuntimeState: (...args) => runtimeApiRef.current.updateTaskRuntimeState?.(...args),
    userCancelledTaskIdsRef,
    viewModeRef,
    workspaceState,
    workspaceStateWithConversationDetail,
  });

  draftApiRef.current = { materializeDraftConversationForSend };

  const {
    getRuntime,
    mutateRuntime,
    batchRuntimeMutations,
    syncDisplayedRuntime,
    activeRuntimeTargetConvId,
    setRuntimeBusy,
    flushRuntimeTasksToWorkspace,
    setRuntimeActiveTaskId,
    setRuntimeActiveRunId,
    setRuntimeFetchController,
    setRuntimeAnswerBuffer,
    readRuntimeAnswerBuffer,
    updateTaskRuntimeState,
    showToast,
  } = createConversationRuntime({
    conversationIdRef,
    createEmptyTaskRuntimeState,
    normalizeWorkspaceOrdering,
    notifyTaskComplete,
    runtimesRef,
    setBusy,
    setShellSeeded, setConversationStopState, setConversationRetryPending,
    setToast,
    setWorkspaceState,
    setTaskRuntimeState,
    streamTargetConvIdRef,
    taskImageAttachmentsRef,
    toastTimerRef,
  });

  runtimeApiRef.current = {
    getRuntime,
    isConversationActivationCurrent,
    removeMissingTask,
    restoreLatestTaskRuntime,
    mutateRuntime,
    flushRuntimeTasksToWorkspace,
    updateTaskRuntimeState,
    setRuntimeActiveTaskId,
    setRuntimeBusy,
    setRuntimeFetchController,
    showToast,
  };

  const {
    applyConversationSnapshot,
    detachActiveRunFromCurrentConversation,
    activateConversationShell,
    activateConversationDetail,
    fetchConversationDetail,
    dropMissingConversation,
    ensureTaskForEvent,
    updateTaskById,
    getTaskById, recoverConversationTasks,
    ensureConversationRuntime,
  } = createConversationActivationHandlers({
    API_BASE,
    activeRuntimeTargetConvId,
    apiFetch,
    applyContextUsage,
    buildTaskRuntimeRecord,
    chatImageFallbacksByTaskIdFromMessages,
    clearDraftConversationState,
    contextUsageFromConversationDetail,
    conversationIdRef,
    draftConversationRef,
    estimateContextUsageFromConversationDetail,
    findConversationById,
    findProjectByConversationId,
    flushRuntimeTasksToWorkspace,
    getRuntime,
    invalidateConversationActivation,
    isConversationActivationCurrent,
    isTaskActuallyActive,
    isTerminalTaskStatus,
    latestContextUsageFromTasks,
    loadStoredContextUsage,
    mergeChatImageRefs,
    modeLocationRef,
    mutateRuntime,
    pendingCreatedDetailRef,
    restoreTaskRuntimes,
    runtimesRef,
    setComposerAttachment,
    setConversationAttachments,
    setConversationId,
    setLocalWorkspace,
    setStoredConversationId: persistStoredConversationId,
    setUploadState,
    setViewMode,
    setWorkspaceState,
    sortTaskIdsForRestore,
    syncDisplayedRuntime,
    taskImageAttachmentsRef,
    taskSummaryToRuntimeTask,
    timestampValue,
    updateTaskRuntimeState,
    userCancelledTaskIdsRef,
    viewModeRef,
    workspaceState,
    workspaceStateWithConversationDetail,
  });

  activationApiRef.current = {
    applyConversationSnapshot,
    detachActiveRunFromCurrentConversation,
    activateConversationShell,
    activateConversationDetail,
    fetchConversationDetail,
    dropMissingConversation,
    ensureTaskForEvent,
    updateTaskById,
    getTaskById,
    isConversationActivationCurrent,
    currentActivationSeq: () => conversationActivationSeqRef.current,
    abortPendingRequests: () => {
      runtimesRef.current.forEach((runtime) => runtime.fetchController?.abort?.());
      conversationDetailAbortRef.current?.abort?.();
    },
  };

  const {
    handleToggleSettings,
    handleSaveSettingsDraft,
    handleSaveToolsSettingsDraft,
    handleDeleteLlmProvider,
    handleToggleLlmProvider,
    applyAgentSettingsPayload,
    fetchAgentSettingsPayload,
    handleTogglePresetAgent,
    handleCreateCustomAgent,
    handleSaveCustomAgent,
    handleDeleteCustomAgent,
    applyWorkflowSettingsPayload,
    fetchWorkflowSettingsPayload,
    handleTogglePresetWorkflow,
    handleCreateCustomWorkflow,
    handleSaveCustomWorkflow,
    handleDeleteCustomWorkflow,
    handleTestLlmConfig,
    handleTestWebProvider,
    handleSettingsConnectionDirty,
    handleTestSettingsConnection,
    handleInstallSkillPackage,
    handleToggleSkill,
    handleUninstallSkill,
  } = createSettingsHandlers({
    API_BASE,
    beginLlmSettingsWrite,
    SETTINGS_RECORDS_STORAGE_KEY,
    WEB_SEARCH_PROVIDER_OPTIONS,
    activeTab,
    skillConversationId: conversationId?.startsWith('draft-') ? '' : conversationId || '',
    invalidateSkillInventory: () => skillInventoryCacheRef.current.invalidate(), beginToolsSettingsSave,
    agentCatalogFromSettings,
    agentSettingsDraft,
    applyMemorySettingsPayloadToRecords,
    applyToolsSettingsPayloadToRecords: (records, payload, recordsAtRequest) => {
      if (skillInventoryKeyRef.current === skillInventoryKey) return applyToolsSettingsPayloadToRecords(records, payload, recordsAtRequest);
      return applyToolsSettingsPayloadToRecords(records, copySettingsResponse(payload, { ...payload, skills: undefined }), recordsAtRequest);
    },
    apiFetch,
    buildMemorySettingsPayload,
    buildToolsSettingsPayload,
    busy,
    createDefaultCustomAgentPayload,
    createDefaultCustomWorkflowPayload,
    getSelectedLlmConfig,
    llmProviderRequestPayload,
    llmSettingsDraft,
    normalizeAgentSettings,
    normalizeWorkflowSettings,
    parseResponseMessage,
    payloadForCustomWorkflow,
    setActiveTab,
    setAgentCatalog: () => {
      // Settings responses are not workspace-scoped runtime catalogs. Re-read
      // the current catalog instead of publishing old-workspace Skill metadata.
      if (agentContextKeyRef.current !== agentContextKey) return;
      setAgentCatalog(staleAgentCatalog);
      setAgentLoadState({ key: agentContextKey, status: 'loading', error: '' });
      setAgentRetry((attempt) => attempt + 1);
    },
    setAgentSettingsDraft,
    setSettingsMode,
    setSettingsRecordsDraft,
    setSettingsSection,
    setSkillActionBusy,
    setWorkflowSettingsDraft,
    settingsRecordsDraft,
    showToast,
    updateSettingsConnectionStatus,
    withAlwaysAllowedAgentTools,
    workflowById,
    workflowSettingsDraft,
  });
  settingsApiRef.current = {
    applyAgentSettingsPayload,
    applyWorkflowSettingsPayload,
    fetchAgentSettingsPayload,
    fetchWorkflowSettingsPayload,
  };

  const {
    uploadAttachment,
    uploadChatImage,
    handleAttachmentSelect,
    handleAttachmentClear,
  } = createComposerHandlers({
    API_BASE,
    applyConversationSnapshot,
    apiFetch,
    conversationId,
    conversationIdRef, conversationActivationSeqRef,
    draftConversationRef,
    ensureServerConversationForActiveDraft,
    getRuntime,
    isDraftConversationId,
    markDraftConversationKept,
    mutateRuntime,
    setComposerAttachment,
    setRuntimeFetchController,
    setUploadState,
    showToast,
    viewMode,
    viewModeRef,
  });

  const {
    executeQuest,
    executeWorkflowNodeRerun,
    applyScheduledEvent,
  } = createTaskStreamHandlers({
    API_BASE, providerOptions: llmProviderOptions,
    CHAT_FINAL_FOLLOWUP_EVENT_TYPES,
    STREAM_EVENT_BATCH_MS,
    STREAM_IMMEDIATE_EVENT_TYPES,
    activeRuntimeTargetConvId,
    appendAnswerDelta,
    appendChatProgressText,
    applyConversationSnapshot,
    applyContextUsage,
    batchRuntimeMutations, buildTaskRuntimeRecord,
    applyTerminalTaskState,
    apiFetch,
    buildApiHeaders,
    chatFinalizedTaskIdsRef,
    conversationId,
    conversationIdRef,
    ensureTaskForEvent,
    eventDeltaText, fetchTaskRuntimeDetail,
    flushRuntimeTasksToWorkspace,
    generateHexId,
    getChatProgressLine,
    getRuntime,
    getTaskById,
    getToolResponseTraceStatus,
    isTerminalTaskStatus,
    mergeChatImageRefs,
    mutateRuntime,
    normalizeChatImageRefs,
    normalizeContextUsage,
    normalizeTaskStatus,
    normalizeRuntimeEvent,
    readRuntimeAnswerBuffer, recoverConversationTasks,
    // Late-bound: defined by createDeployHandlers later in the render body.
    removeConversationTaskFromWorkspace: (...args) => deployApiRef.current.removeConversationTaskFromWorkspace?.(...args),
    resolveProviderMeta, restoreLatestTaskRuntime,
    setComposerAttachment,
    setRuntimeActiveTaskId,
    setRuntimeAnswerBuffer,
    setRuntimeBusy,
    setRuntimeFetchController,
    setUploadState,
    showToast,
    streamTargetConvIdRef,
    stripChatImageAugmentation,
    taskHasAssistantStreamContent,
    toDisplayText,
    updateTaskById,
    updateTaskRuntimeState,
    uploadAttachment,
    upsertToolCall,
    userCancelledTaskIdsRef,
  });

  const {
    handleSelectConversation, handleGoalCommand,
    handleConversationRemoved,
    handleSelectProject,
    handleToggleProject,
    handleToggleConversationTasks,
    handleToggleProjectConversations,
    handlePinConversation,
    handleReorderConversations,
    handlePinProject,
    handleReorderProjects,
    createConversationInProject,
    handleAddConversation,
    handleAddProject,
    handleDeleteConversation,
    handleRenameConversation,
    handleRenameProject,
    handleRemoveProject,
    handleToggleViewMode,
    handleOpenTaskReport,
    handleRetryTask,
    handleForkMessage,
  } = createConversationHandlers({
    executeQuest, recoverConversationTasks, workflowById, workflowSettingsDraft, setSelectedWorkflowId, configSync, providerOptions: llmProviderOptions,
    API_BASE,
    DEFAULT_SESSION_NAME,
    activateConversationDetail,
    activateConversationShell,
    applyConversationSnapshot,
    apiFetch,
    buildApiHeaders,
    replaceWorkspaceModeFromProjects,
    conversationReorderChainsRef,
    conversationReorderVersionsRef,
    projectReorderChainRef,
    projectReorderVersionRef,
    // Late-bound: createDeployHandlers runs after this factory (selection pending deps).
    buildDeployRequest: (...args) => deployApiRef.current.buildDeployRequest?.(...args),
    conversationError,
    setConversationError,
    settingsMode, canStartDeployForConversation: (...args) => deployApiRef.current.canStartDeployForConversation?.(...args),
    clearDraftConversationState,
    conversationDetailAbortRef,
    conversationId,
    conversationIdRef,
    createDefaultProject,
    draftConversationRef,
    dropMissingConversation,
    fetchConversationDetail,
    findConversationById,
    findProjectByConversationId,
    getRuntime, mutateRuntime,
    invalidateConversationActivation,
    isConversationActivationCurrent,
    modeLocationRef,
    normalizeWorkspaceOrdering,
    openDraftConversation,
    setActiveTab,
    setSettingsMode,
    setHollow,
    setViewMode,
    setWorkspaceState,
    showToast,
    startDeploy: (...args) => deployApiRef.current.startDeploy?.(...args),
    stopConversationRuntimeBeforeDelete,
    taskUpdatedTimestamp,
    viewModeRef,
    workspaceState,
    workspaceStateWithConversationDetail,
  });

  const {
    removeConversationTaskFromWorkspace,
    handleStop,
    buildDeployRequest,
    canStartDeployForConversation,
    failPendingDeploy,
    startDeploy,
    handleDeploy: deployTask,
  } = createDeployHandlers({
    uploadChatImage, providerOptions: llmProviderOptions,
    APP_DEFAULT_AGENT_OPTIONS,
    applyTerminalTaskState,
    busy,
    cancelActiveConversationTask,
    cancelActiveTask, recoverConversationTasks,
    queueTaskInput,
    chatFinalizedTaskIdsRef,
    conversationDetailToWorkspaceConversation,
    conversationError,
    conversationId,
    conversationIdRef,
    conversationReady,
    conversationSelectionPending,
    contextTask,
    clearContextTask: () => setContextTask(null),
    createEmptyTaskRuntimeState,
    createPendingTaskDraft,
    defaultAgentId,
    defaultWorkflowId,
    draftConversationRef,
    executeQuest,
    findConversationById,
    flushRuntimeTasksToWorkspace,
    getRuntime,
    isDefaultConversationName,
    isDraftFirstSendInFlight,
    isTaskActuallyActive,
    markDraftFirstSendInFlight,
    materializeDraftConversationForSend,
    mutateRuntime,
    normalizeWorkflowSettings,
    normalizeWorkspaceOrdering,
    pendingCreatedDetailRef,
    queuedDeploy,
    readRuntimeAnswerBuffer,
    selectedConversationId,
    setComposerAttachment,
    setQueuedDeploy,
    setRuntimeActiveRunId,
    setRuntimeActiveTaskId,
    setRuntimeBusy,
    setRuntimeFetchController,
    setWorkspaceState,
    showToast,
    taskHasAssistantStreamContent,
    taskUpdatedTimestamp,
    titleFromTaskText,
    updateTaskById,
    updateTaskRuntimeState,
    userCancelledTaskIdsRef,
    viewMode,
    viewModeRef,
    workflowSettingsDraft,
    workspaceState,
    workspaceStateWithConversationDetail,
    workspaceStateWithTouchedConversation,
  });

  const handleSelectWorkflowTask = createWorkflowTaskSelectionHandler({
    getRuntime, setTaskCompletionNotices, setViewedWorkflowTask, ownerIdRef,
    handleSelectConversation, restoreLatestTaskRuntime, conversationIdRef,
    removeMissingTask, showToast,
  });
  async function handleDeleteWorkflowTask(_projectId, targetConversationId, task) {
    const taskId = task?.taskId || task?.task_id || task?.id;
    if (!targetConversationId || !taskId) return;
    if (viewedWorkflowTask?.projectId === _projectId && viewedWorkflowTask.taskId === taskId) {
      setViewedWorkflowTask(null);
    }
    const response = await apiFetch(`${API_BASE}/api/tasks/${encodeURIComponent(taskId)}`, {
      method: 'DELETE',
    });
    if (!response.ok && response.status !== 404) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.detail || `task delete failed: ${response.status}`);
    }
    updateTaskRuntimeState((state) => {
      const tasksById = { ...(state.tasksById || {}) };
      delete tasksById[taskId];
      const taskOrder = (state.taskOrder || []).filter((id) => id !== taskId);
      return {
        ...state,
        tasksById,
        taskOrder,
        activeTaskId: state.activeTaskId === taskId ? (taskOrder.at(-1) || null) : state.activeTaskId,
        pendingTask: (state.pendingTask?.taskId || state.pendingTask?.id) === taskId ? null : state.pendingTask,
      };
    }, targetConversationId);
    removeConversationTaskFromWorkspace(targetConversationId, taskId);
    chatFinalizedTaskIdsRef.current.delete(taskId);
    userCancelledTaskIdsRef.current.delete(taskId);
    setTaskCompletionNotices((current) => clearTaskCompletionNotice(current, targetConversationId, taskId));
  }
  const loadEarlierTaskRuntimes = async (targetConversationId, requestedTaskIds = []) => {
    if (!targetConversationId || conversationIdRef.current !== targetConversationId) return;
    const activationSeq = conversationActivationSeqRef.current;
    const runtimeState = getRuntime(targetConversationId)?.taskRuntimeState;
    const pendingIds = pendingTaskRuntimeIds(runtimeState?.taskOrder, runtimeState?.tasksById);
    // 视口里点名要的那几行：只回拉它们（已经补过水的直接剔掉）。没人点名（例如重试
    // 按钮）才退回「最新的待补水一页」，保持旧的单页节奏。
    const requested = Array.isArray(requestedTaskIds) && requestedTaskIds.length
      ? requestedTaskIds.filter((taskId) => pendingIds.includes(taskId))
      : nextEarlierTaskRuntimeIds(runtimeState?.taskOrder, runtimeState?.tasksById);
    if (requested.length === 0) return;
    return restoreTaskRuntimes(requested, {
      targetConversationId,
      isCurrentActivation: () => conversationIdRef.current === targetConversationId
        && isConversationActivationCurrent(activationSeq),
    });
  };

  return {
    ensureServerConversationForActiveDraft, materializeDraftConversationForSend, fetchTaskRuntimeDetail, fetchTaskRuntimeBatch,
    restoreLatestTaskRuntime, getRuntime, setRuntimeBusy, flushRuntimeTasksToWorkspace,
    setRuntimeActiveTaskId, setRuntimeFetchController, updateTaskRuntimeState, showToast,
    getTaskById, ensureConversationRuntime, handleToggleSettings, handleSaveSettingsDraft,
    handleSaveToolsSettingsDraft, handleDeleteLlmProvider, handleToggleLlmProvider, handleTogglePresetAgent,
    handleCreateCustomAgent, handleSaveCustomAgent, handleDeleteCustomAgent, handleTogglePresetWorkflow,
    handleCreateCustomWorkflow, handleSaveCustomWorkflow, handleDeleteCustomWorkflow, handleTestLlmConfig,
    handleTestWebProvider, handleSettingsConnectionDirty, handleTestSettingsConnection, handleInstallSkillPackage,
    handleToggleSkill, handleUninstallSkill, handleAttachmentSelect, handleAttachmentClear,
    executeWorkflowNodeRerun, applyScheduledEvent, handleSelectConversation, handleGoalCommand,
    handleConversationRemoved, handleSelectProject, handleToggleProject, handleToggleConversationTasks,
    handleToggleProjectConversations, handlePinConversation, handleReorderConversations, handlePinProject,
    handleReorderProjects, handleAddConversation, handleAddProject, handleDeleteConversation,
    handleRenameConversation, handleRenameProject, handleRemoveProject, handleToggleViewMode,
    handleOpenTaskReport, handleRetryTask, handleForkMessage, removeConversationTaskFromWorkspace,
    handleStop, buildDeployRequest, canStartDeployForConversation, failPendingDeploy,
    startDeploy, deployTask, handleSelectWorkflowTask, handleDeleteWorkflowTask,
    loadEarlierTaskRuntimes,
  };
}
