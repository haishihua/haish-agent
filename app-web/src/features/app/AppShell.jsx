import React from 'react';
import { conversationContentLoading } from '../chat/model/conversation-loading.js';
import { BoundedCache } from '../../shared/lib/bounded-cache.js';
import { approvalStore } from '../approvals/model/approval-store.js';
import { useNodeRuntimeConfigs } from '../workflow/hooks/useNodeRuntimeConfigs.js';
import { useConversationAgentSelection } from '../conversations/hooks/useConversationAgentSelection.js';
import {
  applyToolsSettingsPayloadToRecords,
} from '../settings/model/settings-payload.js';
import { API_BASE } from '../../shared/api/base.js';
import { useLiveToolsSettings } from '../settings/hooks/useLiveToolsSettings.js';
import { useSettingsSynchronization } from '../settings/hooks/useSettingsSynchronization.js';
import { useLocalFileLinks } from './hooks/useLocalFileLinks.js';
import { useWindowChromeState, useWindowFocus } from './hooks/useWindowShellEffects.js';
import { useWorkflowSettingsSectionSync, useMemorySettingsSectionSync } from './hooks/useSettingsSectionPayloadSync.js';
import { useRuntimeCachePruning } from './hooks/useRuntimeCachePruning.js';
import { useTaskCompletionNoticeStorage } from './hooks/useTaskCompletionNoticeStorage.js';
import { useQueuedDeployFlush } from './hooks/useQueuedDeployFlush.js';
import { useActiveTaskSanityReset } from './hooks/useActiveTaskSanityReset.js';
import { useConversationPanelActions } from './hooks/useConversationPanelActions.js';
import { useContextUsageBridge } from './hooks/useContextUsageBridge.js';
import { useShellHandlers } from './hooks/useShellHandlers.js';
import {
  useShellConversationBootstrap,
  useShellConversationListPolling,
  useShellTaskRuntimePolling,
} from './hooks/useShellRuntimeWiring.js';
import { AppSplash } from './components/AppSplash.jsx';
import { panelWorkspaceStateFor, visiblePanelWorkspaceStateFor } from './model/panel-workspace-state.js';
import { buildChatRows } from './model/chat-rows.js';
import {
  activeTaskTextFor,
  pendingEarlierTaskRuntimeIdsFor,
  questsFromRuntimeState,
  runtimeCurrentTaskFor,
  workflowOptionsFromDraft,
} from './model/shell-derived-state.js';
import { useLlmSettings } from '../settings/hooks/useLlmSettings.js';
import { createSkillInventoryCache } from '../settings/model/skill-inventory.js';
import {
  apiFetch,
  buildRunConfigStorageKey,
  parseResponseMessage,
} from '../../shared/api/client.js';
import {
  APP_DEFAULT_AGENT_OPTIONS,
  DEFAULT_AGENT_SETTINGS,
  normalizeAgentSettings,
} from '../agents/model/agent-settings.js';
import { startAgentCatalogLoad, staleAgentCatalog } from '../agents/model/agent-catalog-loading.js';
import {
  DEFAULT_WORKFLOW_SETTINGS,
  DIRECT_AGENT_WORKFLOW_ID,
} from '../workflow/model/workflow-defaults.js';
import {
  loadLlmSettingsDraft,
} from '../settings/model/llm-settings.js';
import {
  loadSettingsRecordsDraft,
} from '../settings/model/settings-records.js';
import {
  normalizeWorkflowSettings,
  workflowById,
} from '../workflow/model/workflow-catalog.js';
import {
  createEmptyContextUsage,
} from '../chat/model/context-usage.js';
import {
  saveWorkspaceState,
  findConversationById,
  createEmptyWorkspaceState,
  taskUpdatedTimestamp,
  isTaskActuallyActive,
} from '../conversations/model/workspace-state.js';
import {
  isRunStateLive,
  settledTaskIds,
} from '../conversations/model/conversation-run-state.js';
import { useConversationRunState } from '../conversations/hooks/useConversationRunState.js';
import {
  createEmptyTaskRuntimeState,
  isPendingTaskId,
} from '../tasks/model/task-runtime.js';
import {
  staleTaskRuntimeIds,
} from '../tasks/model/task-runtime-paging.js';
import {
  addTaskCompletionNotice,
  clearConversationCompletionNotices,
  clearReadTaskCompletionNotices,
  mergeConversationReadCursors,
  taskCompletionNoticeKey,
  terminalTaskNoticeStatus,
} from '../tasks/model/task-completion-notices.js';

import { createRunConfigSync } from '../conversations/model/run-config-sync.js';
import { runConfigApi } from '../conversations/api/run-config.js';
import { createScheduledRuntimeHandlers } from '../schedules/model/runtime-handlers.js';
import { usePerConversationDraft } from '../chat/hooks/usePerConversationDraft.js';
import { saveLastLocation } from '../conversations/model/last-location.js';
import { useViewedTaskCompletionNotice } from '../tasks/hooks/useViewedTaskCompletionNotice.js';
import {
  buildWorkspaceStateFromProjects,
  replaceWorkspaceModeFromProjects,
} from './model/workspace-runtime.js';
import { AppShellView } from './AppShellView.jsx';

const { useState, useEffect, useRef, useMemo } = React;

export function AppShell() {
  const configSync = useMemo(() => createRunConfigSync(runConfigApi), []);
  React.useEffect(() => {
    approvalStore.start();
    return () => approvalStore.stop();
  }, []);
  const [taskRuntimeState, setTaskRuntimeState] = useState(() => createEmptyTaskRuntimeState());
  const [workspaceState, setWorkspaceState] = useState(() => createEmptyWorkspaceState());
  // 打开应用后先做一次性加载（服务端项目/会话同步）。加载完成前侧边栏只展示
  // Haish logo 图标（闪烁动画），不渲染本地缓存里可能过期的项目/会话。
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [viewMode, setViewMode] = useState('chat');
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('');
  const [viewedWorkflowTask, setViewedWorkflowTask] = useState(null);
  const composerImageDraftsRef = useRef(new Map());
  const [conversationPanelCollapsed, setConversationPanelCollapsed] = useState(false);
  const [taskCompletionNotices, setTaskCompletionNotices] = useState({});
  const [taskCompletionNoticesOwner, setTaskCompletionNoticesOwner] = useState('');
  const [windowFocused] = useWindowFocus();
  const viewModeRef = useRef('chat');
  const conversationReorderChainsRef = useRef(new Map());
  const conversationReorderVersionsRef = useRef(new Map());
  const projectReorderChainRef = useRef(Promise.resolve());
  const projectReorderVersionRef = useRef(0);
  const modeLocationRef = useRef({ chat: null, workflow: null });
  const [busy, setBusy] = useState(false);
  const [conversationStopState, setConversationStopState] = useState({ pending: false, error: '' });
  const [conversationRetryPending, setConversationRetryPending] = useState(false);
  // 「当前显示的这份时间线还是工作区快照搭的」——由运行时投影过来（见
  // createConversationRuntime 的 syncDisplayedRuntime）。会话刚打开时快照只有标题和
  // 状态，助手正文还没水合，时间线用加载动画占位。
  const [shellSeeded, setShellSeeded] = useState(false);
  const [hollow, setHollow] = useState(null);
  // 报告对话框的「以此为上下文开新任务」挂在这里，输入框上那枚标签带进下一条 deploy。
  const [contextTask, setContextTask] = useState(null);
  const [conversationId, setConversationId] = useState(null);
  const [ownerId, setOwnerId] = useState('');
  const [conversationReady, setConversationReady] = useState(false);
  const [conversationError, setConversationError] = useState('');
  const [, setConversationAttachments] = useState([]);
  const [contextUsage, setContextUsage] = useState(() => createEmptyContextUsage(null));
  // 表盘读数的仲裁基准放在 ref 里：同一次事件里可能连着写几次（任务 + 会话级），
  // 后台会话的轮询也要先跟已落盘的值比一次，state 闭包里读不到最新的那份。
  const contextUsageTrackerRef = useRef(null);
  const [localWorkspace, setLocalWorkspace] = useState({ path: null, label: null });
  const [composerAttachment, setComposerAttachment] = useState(null);
  const [uploadState, setUploadState] = useState({ active: false, fileName: '' });
  const [queuedDeploy, setQueuedDeploy] = useState(null);
  // 提示条改成堆叠队列：每条自己 3200ms 过期，同 kind+message 去重刷新，最多 3 条。
  const [toasts, setToasts] = useState([]);
  const [agentCatalog, setAgentCatalog] = useState(() => ({
    options: APP_DEFAULT_AGENT_OPTIONS,
    defaultAgentId: APP_DEFAULT_AGENT_OPTIONS[0].id,
  }));
  const agentContextKey = JSON.stringify([ownerId, localWorkspace.path]);
  const agentContextKeyRef = useRef(agentContextKey);
  agentContextKeyRef.current = agentContextKey;
  const [agentLoadState, setAgentLoadState] = useState({ key: '', status: 'loading', error: '' });
  const [agentRetry, setAgentRetry] = useState(0);
  const agentState = agentLoadState.key === agentContextKey ? agentLoadState : { status: 'loading', error: '' };
  const agentLoading = agentState.status === 'loading';
  const [workflowLoading, setWorkflowLoading] = useState(true);
  const [agentSettingsDraft, setAgentSettingsDraft] = useState(() => normalizeAgentSettings(DEFAULT_AGENT_SETTINGS));
  const [workflowSettingsDraft, setWorkflowSettingsDraft] = useState(() => normalizeWorkflowSettings(DEFAULT_WORKFLOW_SETTINGS));

  const copyTimerRef = useRef(null);
  const [settingsMode, setSettingsMode] = useState(false);
  const [settingsSection, setSettingsSection] = useState('llm');
  const [automationExpanded, setAutomationExpanded] = useState(false);
  const [skillsExpanded, setSkillsExpanded] = useState(false);
  const [agentSettingsReady, setAgentSettingsReady] = useState(false);
  const needsAgentSettings = settingsMode && (automationExpanded || ['agent', 'workflow'].includes(settingsSection));
  const [llmSettingsDraft, setLlmSettingsDraft] = useState(() => loadLlmSettingsDraft());
  const [settingsRecordsDraft, setSettingsRecordsDraft] = useState(() => loadSettingsRecordsDraft());
  const settingsSync = useSettingsSynchronization({ records: settingsRecordsDraft, llm: llmSettingsDraft, agents: agentSettingsDraft, workflows: workflowSettingsDraft });
  // 测试结果的权威副本随已保存的连接一起存（后端）。这里只放本轮会话的临时状态。
  const [settingsConnectionStatus, setSettingsConnectionStatus] = useState({ memory: {} });
  const [settingsSelection, setSettingsSelection] = useState(() => ({
    llm: 'chat',
    llmConfig: 'chat',
    tools: 'tools-mcp',
    memory: 'memory-qdrant',
    agent: 'agent-default',
    workflow: '',
  }));
  // 一次性请求：让设置页直接打开某个编辑器（运行页标题点击 → 工作流配置），设置页消费完就清空。
  const [pendingSettingsEditor, setPendingSettingsEditor] = useState(null);
  const [skillActionBusy, setSkillActionBusy] = useState('');
  const [toolsLoadState, setToolsLoadState] = useState({ key: '', status: 'idle', error: '' });
  const toolsRefreshRef = useRef(null);
  const skillInventoryCacheRef = useRef(createSkillInventoryCache());
  const skillInventoryKey = JSON.stringify([ownerId, conversationId, localWorkspace.path]);
  const skillInventoryKeyRef = useRef(skillInventoryKey);
  skillInventoryKeyRef.current = skillInventoryKey;
  const needsToolsSettings = settingsMode && (settingsSection === 'tools' || skillsExpanded);
  // Inventory belongs to the workspace, not the selected Settings page.
  const toolsContextKey = skillInventoryKey;
  const toolsSettingsState = toolsLoadState.key === toolsContextKey ? toolsLoadState : { status: 'loading', error: '' };
  const conversationIdRef = useRef(null);
  const ownerIdRef = useRef('');
  const conversationDetailAbortRef = useRef(null);
  const chatMessageRowsCacheRef = useRef(new WeakMap());
  const chatFinalizedTaskIdsRef = useRef(new Set());
  const userCancelledTaskIdsRef = useRef(new Set());
  const taskImageAttachmentsRef = useRef(new BoundedCache(64));
  const taskRuntimeEventCacheRef = useRef(new BoundedCache(32));
  const taskRuntimeFetchesRef = useRef(new Map());
  const completionReportedTaskIdsRef = useRef(new Set());
  const completionViewRef = useRef({ chatVisible: false });
  const conversationReadCursorsRef = useRef({});
  const runtimeApiRef = useRef({});
  const activationApiRef = useRef({});
  const deployApiRef = useRef({});
  const draftApiRef = useRef({});
  const directorySelectionApiRef = useRef({});
  const settingsApiRef = useRef({});
  // 提示条计时器注册表：Map<去重键, { id, timerId }>，插入顺序即队列顺序（最旧在前）。
  // 放在 ref 里，运行时每次渲染新建闭包、以及卸载清理都读到同一份。
  const toastTimerRef = useRef(new Map());
  const conversationActivationSeqRef = useRef(0);
  // Local draft opened by "new conversation" before the user sends a message.
  // It is intentionally NOT inserted into the sidebar list until first send.
  const draftConversationRef = useRef(null);
  // One remembered blank-chat id per project, so unsent text typed in a new
  // conversation survives switching to another conversation and back.
  const draftConversationIdsRef = useRef(new Map());
  // Unsent composer text is stored per conversation so switching chats keeps
  // each input box independent. Declared early so draft materialization can rekey it.
  const {
    draft: chatDraft,
    setDraft: setChatDraft,
    rekeyDraft: rekeyChatDraft,
  } = usePerConversationDraft(conversationId);
  // Server conversation created for a draft (e.g. image/file upload) but not yet
  // revealed in the sidebar because the user still has not sent a message.
  const pendingCreatedDetailRef = useRef(null);
  // 草稿的建会话 / 首条发送只允许一条在途记录：重复提交不能各建一条服务端会话，
  // 也不能把首条消息的 runtime 交接弄丢（见 createDraftConversationHandlers）。
  const draftServerCreateRef = useRef(null);
  const draftFirstSendRef = useRef(null);
  // Per-conversation runtime store. This is the single source of truth for
  // live task state; React state only projects the currently displayed entry.
  const runtimesRef = useRef(new Map());
  useRuntimeCachePruning({ runtimesRef, conversationId, setWorkspaceState });
  // While an SSE flush is happening this holds the conversation id that owns
  // the in-flight stream. Setters consult it before falling back to
  // `conversationIdRef.current`, so events from a now-backgrounded conversation
  // still write to *its* runtime (not the one currently shown). Acts as an
  // implicit dynamic context — set on flush enter, cleared on flush exit.
  const streamTargetConvIdRef = useRef(null);
  const { applyContextUsage, resetContextUsage } = useContextUsageBridge({
    contextUsageTrackerRef, conversationIdRef, setContextUsage,
  });

  // agent/skill 目录只在换 workspace、重试或下一次任务开始时重读，focus/设置事件不重读。
  useEffect(() => {
    const workspaceQuery = localWorkspace.path
      ? `?workspace_path=${encodeURIComponent(localWorkspace.path)}`
      : '';
    setAgentCatalog(staleAgentCatalog);
    const load = startAgentCatalogLoad({
      request: apiFetch,
      url: `${API_BASE}/api/agents${workspaceQuery}`,
      onState: (state) => setAgentLoadState({ ...state, key: agentContextKey }),
      onCatalog: setAgentCatalog,
      onRuntime: (runtime) => {
        const contextWindowTokens = Number(runtime?.context_window_tokens) || 0;
        if (contextWindowTokens > 0) contextUsageTrackerRef.current?.setTotalTokens(contextWindowTokens);
      },
    });
    return load.cancel;
  }, [localWorkspace.path, agentContextKey, agentRetry]);

  useEffect(() => {
    let cancelled = false;
    let retryTimer = null;
    const load = async (attempt = 0) => {
      try {
        const payload = await settingsApiRef.current.fetchWorkflowSettingsPayload();
        if (cancelled) return;
        settingsApiRef.current.applyWorkflowSettingsPayload(payload);
        setWorkflowLoading(false);
      } catch (error) {
        if (cancelled) return;
        // Desktop startup can render before the local Python runtime is ready.
        if (attempt < 8) {
          retryTimer = window.setTimeout(
            () => load(attempt + 1),
            Math.min(400 * (attempt + 1), 2000),
          );
          return;
        }
        console.warn('failed to fetch workflow catalog', error);
        setWorkflowLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [settingsSync.epochs.workflows]);

  const beginToolsSettingsSave = useLiveToolsSettings({
    enabled: needsToolsSettings,
    refreshEpoch: (settingsSync.epochs.mcp || 0) + (settingsSync.epochs.web_search || 0) + (settingsSync.epochs.skills || 0),
    pageKey: settingsSelection.tools?.startsWith('tools-skills') ? 'skills' : settingsSelection.tools,
    contextKey: toolsContextKey,
    busy: skillActionBusy,
    refreshRef: toolsRefreshRef,
    cache: skillInventoryCacheRef.current,
    fetchPayload: async signal => {
      const response = await apiFetch(`${API_BASE}/api/settings/tools?conversation_id=${encodeURIComponent(conversationId?.startsWith('draft-') ? '' : conversationId || '')}`, { method: 'GET', cache: 'no-store', signal }, { json: false });
      if (!response.ok) throw new Error(await parseResponseMessage(response, `Unable to load current skills (${response.status}).`));
      return response.json();
    },
    onState: setToolsLoadState,
    records: settingsRecordsDraft,
    onPayload: (payload, recordsAtRequest) => {
      setSettingsRecordsDraft(prev => applyToolsSettingsPayloadToRecords(prev, payload, recordsAtRequest));
    },
  });

  useEffect(() => {
    if (!needsAgentSettings) return undefined;
    let cancelled = false;
    let retryTimer = null;
    const load = async (attempt = 0) => {
      try {
        const payload = await settingsApiRef.current.fetchAgentSettingsPayload();
        if (cancelled) return;
        settingsApiRef.current.applyAgentSettingsPayload(payload);
        setAgentSettingsReady(true);
      } catch (error) {
        if (cancelled) return;
        if (attempt < 4) {
          retryTimer = window.setTimeout(() => load(attempt + 1), 400 * (attempt + 1));
          return;
        }
        console.warn('failed to fetch agent settings', error);
        runtimeApiRef.current.showToast?.('error', String(error?.message || error));
      }
    };
    load();
    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [needsAgentSettings, settingsSync.epochs.agents]);
  useWorkflowSettingsSectionSync({
    settingsMode, settingsSection, refreshEpoch: settingsSync.epochs.workflows, settingsApiRef, runtimeApiRef,
  });

  const { providerOptions: llmProviderOptions, beginWrite: beginLlmSettingsWrite } = useLlmSettings({
    draft: llmSettingsDraft, setDraft: setLlmSettingsDraft,
    settingsOpen: settingsMode && ['llm', 'embedding', 'compact'].includes(settingsSection),
    refreshEpoch: settingsSync.epochs.llm,
  });

  useMemorySettingsSectionSync({
    settingsMode, settingsSection, refreshEpoch: settingsSync.epochs.memory, setSettingsRecordsDraft,
  });

  useWindowChromeState();

  const agentOptions = agentState.status === 'ready'
    ? (agentCatalog?.options || APP_DEFAULT_AGENT_OPTIONS)
    : staleAgentCatalog(agentCatalog).options;
  const defaultAgentId = agentCatalog?.defaultAgentId || APP_DEFAULT_AGENT_OPTIONS[0].id;
  const runConfigStorageKey = buildRunConfigStorageKey(ownerId, 'chat', conversationId);
  const botRunConfigStorageKey = runConfigStorageKey ? `${runConfigStorageKey}.bot` : '';
  const workflowOptions = useMemo(() => workflowOptionsFromDraft(workflowSettingsDraft), [workflowSettingsDraft]);
  const defaultWorkflowId = workflowOptions.find((item) => item.id === workflowSettingsDraft.default_workflow_id)?.id
    || workflowOptions[0]?.id
    || DIRECT_AGENT_WORKFLOW_ID;

  useEffect(() => { viewModeRef.current = viewMode; }, [viewMode]);
  useEffect(() => { conversationIdRef.current = conversationId; }, [conversationId]);
  useEffect(() => {
    if (!ownerId) return undefined;
    const save = () => saveWorkspaceState(ownerId, workspaceState);
    const timer = window.setTimeout(save, 500);
    window.addEventListener('pagehide', save);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pagehide', save);
    };
  }, [ownerId, workspaceState]);

  useTaskCompletionNoticeStorage({
    ownerId,
    notices: taskCompletionNotices,
    noticesOwner: taskCompletionNoticesOwner,
    setNotices: setTaskCompletionNotices,
    setNoticesOwner: setTaskCompletionNoticesOwner,
    reportedTaskIdsRef: completionReportedTaskIdsRef,
  });

  function notifyTaskComplete(targetConversationId, taskId, taskOrStatus) {
    const status = terminalTaskNoticeStatus(taskOrStatus);
    const key = taskCompletionNoticeKey(targetConversationId, taskId);
    if (!key || !status || completionReportedTaskIdsRef.current.has(key)) return;
    completionReportedTaskIdsRef.current.add(key);
    const settledAt = taskUpdatedTimestamp(taskOrStatus) || Date.now();
    const viewedNow = completionViewRef.current.chatVisible && document.hasFocus()
      && conversationIdRef.current === targetConversationId;
    const alreadyViewed = Number(conversationReadCursorsRef.current[targetConversationId] || 0) >= settledAt;
    if (viewedNow) {
      markConversationTaskCompletionsViewed(targetConversationId);
      return;
    }
    if (alreadyViewed) return;
    setTaskCompletionNotices((current) => addTaskCompletionNotice(current, {
      conversationId: targetConversationId,
      taskId,
      status,
      settledAt,
    }));
    window.haish?.notifyTaskComplete?.().catch(() => undefined);
  }

  const applySharedConversationReads = React.useCallback((reads) => {
    if (!reads || typeof reads !== 'object') return;
    conversationReadCursorsRef.current = mergeConversationReadCursors(
      conversationReadCursorsRef.current,
      reads,
    );
    setTaskCompletionNotices((current) => clearReadTaskCompletionNotices(
      current,
      conversationReadCursorsRef.current,
    ));
  }, []);

  const refreshSharedConversationReads = React.useCallback(() => (
    window.haish?.getConversationReads?.()
      .then(applySharedConversationReads)
      .catch(() => undefined)
  ), [applySharedConversationReads]);

  const markConversationTaskCompletionsViewed = React.useCallback((targetConversationId) => {
    if (!targetConversationId) return;
    setTaskCompletionNotices((current) => clearConversationCompletionNotices(current, targetConversationId));
    const seenAtMs = Date.now();
    conversationReadCursorsRef.current = {
      ...conversationReadCursorsRef.current,
      [targetConversationId]: seenAtMs,
    };
    window.haish?.markConversationRead?.(targetConversationId, seenAtMs)
      .then((canonicalSeenAt) => {
        conversationReadCursorsRef.current = mergeConversationReadCursors(
          conversationReadCursorsRef.current,
          { [targetConversationId]: canonicalSeenAt },
        );
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!ownerId) return undefined;
    conversationReadCursorsRef.current = {};
    refreshSharedConversationReads();
    const timer = window.setInterval(refreshSharedConversationReads, 3000);
    return () => window.clearInterval(timer);
  }, [ownerId, refreshSharedConversationReads]);

  useEffect(() => {
    if (
      !ownerId
      || activeTab !== 'dashboard'
      || viewMode !== 'chat'
      || !windowFocused
      || !conversationId
      || String(conversationId).startsWith('draft-')
    ) return;
    markConversationTaskCompletionsViewed(conversationId);
  }, [activeTab, conversationId, markConversationTaskCompletionsViewed, ownerId, viewMode, windowFocused]);

  // 部署工厂要用这两条派生值：先算出来再喂给 handlers。
  const selectedConversationId = workspaceState.activeConversationId || null;
  const conversationSelectionPending = Boolean(
    selectedConversationId
    && conversationId
    && selectedConversationId !== conversationId
  );

  const {
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
  } = useShellHandlers({
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
    setTaskCompletionNotices, setTaskRuntimeState, setToast: setToasts, setUploadState,
    setViewMode, setViewedWorkflowTask, setWorkflowSettingsDraft, setWorkspaceState,
    settingsApiRef, settingsMode, settingsRecordsDraft, skillInventoryCacheRef,
    skillInventoryKey, skillInventoryKeyRef, streamTargetConvIdRef, taskImageAttachmentsRef,
    taskRuntimeEventCacheRef, taskRuntimeFetchesRef, toastTimerRef, userCancelledTaskIdsRef,
    viewMode, viewModeRef, viewedWorkflowTask, workflowSettingsDraft,
    workspaceState,
  });
  useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
  }, []);

  useEffect(() => () => {
    const toastTimers = toastTimerRef.current;
    if (!toastTimers) return;
    if (typeof toastTimers.forEach !== 'function') {
      clearTimeout(toastTimers);
      return;
    }
    // 卸载时清掉队列里所有未到期的计时器，避免回调打到已卸载的组件上。
    toastTimers.forEach((entry) => clearTimeout(entry?.timerId ?? entry));
    toastTimers.clear();
  }, []);

  useEffect(() => {
    if (!conversationError) return;
    setHollow({
      title: 'Conversation Load Error',
      result: conversationError,
      taskId: null,
    });
  }, [conversationError]);

  useLocalFileLinks(localWorkspace.path, showToast);

  useShellConversationBootstrap({
    activationApiRef, buildWorkspaceStateFromProjects, ownerIdRef, setConversationError, setConversationReady,
    setOwnerId, setWorkspaceLoading, setWorkspaceState, setViewedWorkflowTask,
  });

  useEffect(() => {
    if (workspaceLoading || !ownerId) return undefined;
    const save = () => saveLastLocation(window.localStorage, ownerId, viewMode, viewedWorkflowTask);
    save();
    window.addEventListener('pagehide', save);
    return () => window.removeEventListener('pagehide', save);
  }, [workspaceLoading, ownerId, viewMode, viewedWorkflowTask]);

  // 列表轮询发现当前会话消失：和处理恢复 404 的是同一条路（换目标或开空白对话）。
  directorySelectionApiRef.current.handleActiveConversationRemoved = handleConversationRemoved;
  useShellConversationListPolling({
    workspaceState, conversationId, conversationIdRef, directorySelectionApiRef, draftConversationRef,
    conversationReady, settingsMode, viewMode, replaceWorkspaceModeFromProjects, setWorkspaceState,
  });
  const quests = useMemo(() => questsFromRuntimeState(taskRuntimeState), [taskRuntimeState]);

  // 下一次任务开始时才重读 agent/skill 目录（不在后台抢当前选择）。
  const handleDeploy = React.useCallback((...args) => { setAgentRetry((attempt) => attempt + 1); return deployTask(...args); }, [deployTask]);
  deployApiRef.current = {
    buildDeployRequest,
    canStartDeployForConversation,
    failPendingDeploy,
    startDeploy,
    handleDeploy,
    handleStop,
    removeConversationTaskFromWorkspace,
  };
  function removeMissingTask(targetConversationId, taskId) {
    if (!targetConversationId || !taskId) return;
    const runtime = getRuntime(targetConversationId);
    // A local draft has no server record yet; a 404 must not discard its images.
    if (isPendingTaskId(runtime, taskId)) return;
    const wasActive = runtime?.activeTaskId === taskId
      || runtime?.taskRuntimeState?.activeTaskId === taskId
      || (runtime?.taskRuntimeState?.pendingTask?.taskId || runtime?.taskRuntimeState?.pendingTask?.id) === taskId;
    updateTaskRuntimeState((state) => {
      const tasksById = { ...(state.tasksById || {}) };
      delete tasksById[taskId];
      return {
        ...state,
        tasksById,
        taskOrder: (state.taskOrder || []).filter((id) => id !== taskId),
        activeTaskId: state.activeTaskId === taskId ? null : state.activeTaskId,
        pendingTask: (state.pendingTask?.taskId || state.pendingTask?.id) === taskId
          ? null
          : state.pendingTask,
      };
    }, targetConversationId);
    removeConversationTaskFromWorkspace(targetConversationId, taskId);
    taskRuntimeEventCacheRef.current.delete(taskId);
    if (wasActive) {
      setRuntimeActiveTaskId(null, targetConversationId);
      setRuntimeFetchController(null, targetConversationId);
      setRuntimeBusy(false, targetConversationId);
    }
  }

  const panelWorkspaceState = useMemo(
    () => panelWorkspaceStateFor({ workspaceState, conversationId, quests }),
    [workspaceState, conversationId, quests],
  );
  const visiblePanelWorkspaceState = useMemo(
    () => visiblePanelWorkspaceStateFor({ panelWorkspaceState, conversationId, viewMode }),
    [panelWorkspaceState, conversationId, viewMode],
  );
  // 当前会话的任务（服务端列表 + 本地运行时合并）——会话状态判据的唯一入口。
  const currentConversation = useMemo(
    () => findConversationById(panelWorkspaceState, conversationId),
    [panelWorkspaceState, conversationId],
  );
  const currentConversationRunState = useConversationRunState({
    conversationId,
    tasks: currentConversation?.tasks,
  });
  // 「在跑 / 在等人」都算这一轮还没结束，两者共用同一判据。它驱动输入框禁用和下面的
  // 轮询循环：会话里只要有未落终态的任务就挡住新输入、保持 UI 同步——无论这一轮是不是
  // 本客户端发起的（只看本地 busy 的话，切回标签页后就是 false）。
  const currentConversationActive = isRunStateLive(currentConversationRunState.state);
  const currentConversationRunning = busy
    || currentConversationActive
    || Boolean(conversationId && getRuntime(conversationId)?.fetchController);
  useQueuedDeployFlush({
    queuedDeploy, setQueuedDeploy, deployApiRef, draftApiRef, runtimeApiRef,
    draftConversationRef, conversationIdRef, conversationId,
    conversationReady, conversationSelectionPending, conversationError,
    currentConversationRunning, uploadActive: uploadState.active, settingsMode,
  });
  useShellTaskRuntimePolling({
    conversationId, conversationIdRef, currentConversationActive, applyContextUsage, fetchTaskRuntimeDetail,
    fetchTaskRuntimeBatch, getRuntime, notifyTaskComplete, panelWorkspaceState, removeMissingTask,
    restoreLatestTaskRuntime, setWorkspaceState,
  });
  const runtimeCurrentTask = useMemo(() => runtimeCurrentTaskFor(taskRuntimeState), [taskRuntimeState]);
  const currentTask = useMemo(() => {
    if (viewMode !== 'chat' && viewedWorkflowTask?.projectId === workspaceState.activeProjectId) {
      const viewedTask = taskRuntimeState.tasksById[viewedWorkflowTask.taskId];
      if (viewedTask) return viewedTask;
    }
    return runtimeCurrentTask;
  }, [workspaceState.activeProjectId, runtimeCurrentTask, viewedWorkflowTask, viewMode, taskRuntimeState.tasksById]);
  const selectedWorkflow = useMemo(() => {
    const selected = workflowById(workflowSettingsDraft, selectedWorkflowId || defaultWorkflowId);
    return currentTask?.executionMode === 'bot' && currentTask.workflowSnapshot
      ? currentTask.workflowSnapshot
      : selected;
  }, [currentTask, defaultWorkflowId, selectedWorkflowId, workflowSettingsDraft]);
  // 运行页只读——想改图就回配置页：标题点一下 = 打开设置页里这个工作流的编辑器（和列表点击同一条路）。
  const openWorkflowConfig = React.useCallback((workflowId) => {
    const id = String(workflowId || '').trim();
    if (!id) return;
    setSettingsMode(true);
    setSettingsSection('workflow');
    setSettingsSelection((prev) => ({ ...prev, workflow: id }));
    setPendingSettingsEditor({ section: 'workflow', id, mode: 'edit' });
  }, []);
  const currentWorkflowTask = currentTask?.executionMode === 'bot' ? currentTask : null;
  completionViewRef.current.chatVisible = activeTab === 'dashboard' && !settingsMode && viewMode === 'chat' && conversationReady;
  useViewedTaskCompletionNotice({ task: currentWorkflowTask, conversationId, visible: activeTab === 'dashboard' && !settingsMode && viewMode !== 'chat' && conversationReady, windowFocused, notices: taskCompletionNotices, setNotices: setTaskCompletionNotices });
  const nodeConfigSelection = useNodeRuntimeConfigs(botRunConfigStorageKey, selectedWorkflow, currentWorkflowTask?.nodeRuntimeConfigs, currentWorkflowTask?.taskId, llmProviderOptions);
  const botNodeConfigs = nodeConfigSelection.configs;
  useActiveTaskSanityReset({
    busy, currentConversationActive, runtimeCurrentTask,
    activeTaskId: taskRuntimeState.activeTaskId, runtimeApiRef,
  });
  useEffect(() => {
    if (!busy || currentConversationActive) return;
    const activeTaskId = taskRuntimeState.activeTaskId;
    if (activeTaskId) return;
    if (taskRuntimeState.pendingTask && isTaskActuallyActive(taskRuntimeState.pendingTask)) return;
    // Stale local runtime guard: if no task is actually active in the current
    // conversation, a leftover `busy` flag should not keep the composer locked.
    runtimeApiRef.current.setRuntimeBusy?.(false);
    runtimeApiRef.current.setRuntimeFetchController?.(null);
    runtimeApiRef.current.setRuntimeActiveTaskId?.(null);
  }, [busy, currentConversationActive, taskRuntimeState.activeTaskId, taskRuntimeState.pendingTask]);
  const activeTaskText = useMemo(() => activeTaskTextFor(taskRuntimeState), [taskRuntimeState]);
  // Older turns keep their summary until the user scrolls up to them, so the
  // conversation no longer replays every task event log on open.
  const pendingEarlierTaskRuntimeIds = useMemo(
    () => pendingEarlierTaskRuntimeIdsFor(taskRuntimeState),
    [taskRuntimeState],
  );
  // 会话目录（服务端列表）里那份任务拷贝。渲染用的 currentConversation.tasks 不是独立
  // 快照：mergeConversationTasks 让本地拷贝覆写 status / completedAt，会把目录写下的
  // 「已落地」信号盖掉（只剩 serverFinished，而它只认 done / failed / cancelled 三个串，
  // 历史别名 completed / aborted 都不算）。所以收工判据直接读这份目录拷贝。
  const directoryConversation = useMemo(
    () => findConversationById(workspaceState, conversationId),
    [conversationId, workspaceState],
  );
  // 两份权威快照：本地运行时拷贝 + 服务端列表拷贝。任何一份落地终态，这一轮就算收工
  // ——和侧边栏用的是同一个判据（model/conversation-run-state.js）。收工的判据只在这里
  // 算一次，行渲染读同一份；但手上那份拷贝可能还停在半路（正文、终态都没到），
  // 那是重建要管的事，见下面的过期拷贝重建。
  const settledRuntimeTaskIds = useMemo(() => settledTaskIds([
    ...taskRuntimeState.taskOrder.map((taskId) => taskRuntimeState.tasksById[taskId]),
    ...(directoryConversation?.tasks || []),
  ]), [directoryConversation, taskRuntimeState]);
  // 已经收工、可本地那份拷贝还停在半路的任务：它的正文永远不会自己出现（轮询只盯
  // 「列表说还活着」的任务），得重建。「这份拷贝停在半路了没」和「这一次重建哪几条」
  // 都在 tasks/model/task-runtime-paging.js，现算而不是 memo——重建过的名单在 ref 里，
  // effect 跑的时候读到的才是最新的那份。
  const staleRuntimeRefreshRef = useRef(new Set());
  // 每次激活重新给一次机会：重建过一次仍然对不上（比如服务端说还在跑）就不再重试，
  // 不然两份快照对不上时这里会一直打转；跳过它们的同时不挡着更早的拷贝接着排队。
  useEffect(() => { staleRuntimeRefreshRef.current = new Set(); }, [conversationId]);
  useEffect(() => {
    if (!conversationId) return;
    const runtime = runtimeApiRef.current;
    // 本地流就是这一轮的主人：它在的时候由它写拷贝，不同时插一手。
    if (runtime.getRuntime(conversationId)?.activeRunId) return;
    const pending = staleTaskRuntimeIds(
      taskRuntimeState.taskOrder,
      taskRuntimeState.tasksById,
      settledRuntimeTaskIds,
      { attemptedIds: staleRuntimeRefreshRef.current },
    );
    if (pending.length === 0) return;
    for (const taskId of pending) staleRuntimeRefreshRef.current.add(taskId);
    const activationSeq = conversationActivationSeqRef.current;
    const isCurrentActivation = () => conversationIdRef.current === conversationId
      && runtime.isConversationActivationCurrent(activationSeq);
    // Keep the event cursor: an incremental rebuild costs a few KB, a full
    // replay of the same task costs megabytes (and re-types every event into
    // the renderer). `load_after` already falls back to a full replay when the
    // cursor no longer matches the file, so keeping it is never wrong.
    const rebuild = async (taskId) => {
      try {
        await runtime.restoreLatestTaskRuntime(taskId, {
          targetConversationId: conversationId,
          isCurrentActivation,
        });
      } catch (error) {
        if (error?.status === 404) runtime.removeMissingTask(conversationId, taskId);
        else console.warn('stale task runtime refresh failed', error);
      }
    };
    for (const taskId of pending) {
      rebuild(taskId);
    }
  }, [conversationId, settledRuntimeTaskIds, taskRuntimeState]);
  const chatMessages = useMemo(() => buildChatRows({
    agentOptions,
    chatMessageRowsCache: chatMessageRowsCacheRef.current,
    conversationId,
    currentConversation,
    settledRuntimeTaskIds,
    taskRuntimeState,
  }), [agentOptions, conversationId, currentConversation, settledRuntimeTaskIds, taskRuntimeState]);
  // 会话正文还在路上：这份时间线是工作区快照搭的（只有标题和状态），会话详情和任务运行
  // 记录都还没回来。这属于「整段会话在加载」，所以由会话面板在正中间整块占位（见
  // chat/components/ChatPanel.jsx 的 loading），而不是在每一轮助手气泡里各转一个圈。
  const conversationLoading = conversationContentLoading({
    shellSeeded,
    rowCount: chatMessages.length,
    draft: Boolean(draftConversationRef.current),
    error: conversationError,
  });
  const chatAgentSelection = useConversationAgentSelection({
    conversation: currentConversation, options: agentOptions, messages: chatMessages,
    pendingTask: taskRuntimeState.pendingTask, running: currentConversationRunning, queued: queuedDeploy, setWorkspaceState,
  });
  const submitPending = Boolean(queuedDeploy || conversationStopState.pending || conversationRetryPending);

  const composerDisabled = Boolean(conversationStopState.error) || uploadState.active
    || settingsMode
    || !!conversationError
    || (viewMode !== 'chat' && currentConversationRunning);

  // 会话面板那一组动作（含失败 toast / 通知清理）在 hook 里装配，JSX 只拿成型回调。
  const panelActions = useConversationPanelActions({
    workspaceState, viewMode, setConversationPanelCollapsed, setTaskCompletionNotices,
    markConversationTaskCompletionsViewed, showToast, handleAddProject, handleSelectProject,
    handleToggleProject, handleRemoveProject, handleAddConversation, handleSelectConversation,
    handleSelectWorkflowTask, handleToggleConversationTasks, handleToggleProjectConversations,
    handleDeleteConversation, handleRenameConversation, handlePinConversation, handlePinProject,
    handleReorderConversations, handleReorderProjects,
  });
  // 一次性加载（项目/会话同步）完成前：整屏只显示居中的 Haish logo。
  if (workspaceLoading) {
    return <AppSplash logoSrc="assets/ui/penguin_logo_user.png" />;
  }

  const scheduleRuntime = createScheduledRuntimeHandlers({ applyScheduledEvent, ensureConversationRuntime, restoreLatestTaskRuntime, flushRuntimeTasksToWorkspace, getRuntime, setRuntimeBusy, isTaskActuallyActive });
  return (
    <AppShellView
      schedules={{
        configSync, conversationId, materializeDraftConversationForSend, conversationIdRef, scheduleRuntime,
      }}
      chrome={{
        viewMode, settingsMode, activeTab, conversationPanelCollapsed, handleToggleViewMode, handleToggleSettings,
        showToast, setActiveTab, windowFocused, toasts, hollow, setHollow, contextTask, setContextTask,
      }}
      settings={{
        settingsSection, setSettingsSection, settingsSelection, setSettingsSelection,
        llmSettingsDraft, setLlmSettingsDraft, settingsRecordsDraft, setSettingsRecordsDraft,
        toolsSettingsState, toolsRefreshRef, agentSettingsDraft, agentSettingsReady,
        setAutomationExpanded, setSkillsExpanded, setAgentSettingsDraft,
        workflowSettingsDraft, setWorkflowSettingsDraft,
        handleSaveSettingsDraft, handleSaveToolsSettingsDraft, handleDeleteLlmProvider, handleToggleLlmProvider,
        handleTogglePresetAgent, handleCreateCustomAgent, handleSaveCustomAgent, handleDeleteCustomAgent,
        handleTogglePresetWorkflow, handleCreateCustomWorkflow, handleSaveCustomWorkflow, handleDeleteCustomWorkflow,
        handleTestLlmConfig, handleTestWebProvider, handleTestSettingsConnection, handleSettingsConnectionDirty,
        settingsConnectionStatus, handleInstallSkillPackage, handleToggleSkill, handleUninstallSkill,
        skillActionBusy, pendingSettingsEditor, setPendingSettingsEditor,
      }}
      sidebar={{
        panelActions, visiblePanelWorkspaceState, taskCompletionNotices, currentWorkflowTask,
        markConversationTaskCompletionsViewed, handleDeleteWorkflowTask, handleRenameProject,
        handleOpenTaskReport, handleRetryTask,
      }}
      chat={{
        ensureServerConversationForActiveDraft, draftConversationRef, pendingEarlierTaskRuntimeIds,
        loadEarlierTaskRuntimes, chatMessages, taskRuntimeState, conversationStopState, conversationRetryPending,
        getRuntime, conversationLoading, currentConversationRunning, composerDisabled, submitPending,
        handleDeploy, handleGoalCommand, handleStop, handleAttachmentSelect, handleAttachmentClear,
        composerImageDraftsRef, composerAttachment, uploadState, contextUsage, localWorkspace, activeTaskText,
        llmProviderOptions, chatAgentSelection, defaultAgentId, agentLoading, agentState, setAgentRetry,
        runConfigStorageKey, chatDraft, setChatDraft, handleForkMessage, getTaskById,
      }}
      workflow={{
        selectedWorkflow, agentOptions, openWorkflowConfig, botNodeConfigs, nodeConfigSelection,
        setViewedWorkflowTask, executeWorkflowNodeRerun, workflowLoading, workflowOptions, defaultWorkflowId,
        setSelectedWorkflowId, botRunConfigStorageKey,
      }}
    />
  );
}
