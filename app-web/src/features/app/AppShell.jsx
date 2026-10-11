import React from 'react';
import { collapseFullTaskAttempts } from '../chat/model/task-attempts.js';
import { conversationContentLoading } from '../chat/model/conversation-loading.js';
import { assistantNameForTask } from '../chat/model/assistant-name.js';
import { BoundedCache } from '../../shared/lib/bounded-cache.js';
import { evictInactiveRuntimes, releaseWorkspaceRuntimeDetails } from '../conversations/model/runtime-cache.js';
import { approvalStore } from '../approvals/model/approval-store.js';
import { ResultDialog } from '../../shared/ui/ResultDialog.jsx';
import { LoadingState } from '../../shared/ui/agent-elements/LoadingState.jsx';
import { MetalFxRuntimeKeeper } from '../../shared/ui/MotionEffects.jsx';
import {
  eventDeltaText,
  stripChatImageAugmentation,
  stripInjectedSkillInstruction,
} from '../chat/model/chat-text.js';
import { TopBar } from './components/TopBar.jsx';
import { ConversationsPanel } from '../conversations/components/ConversationsPanel.jsx';
import { ChatPanel } from '../chat/components/ChatPanel.jsx';
import { useNodeRuntimeConfigs } from '../workflow/hooks/useNodeRuntimeConfigs.js';
import { nodeRuntimeConfigRequest } from '../workflow/model/node-runtime-config.js';
import { ChatComposer } from '../chat/components/ChatComposer.jsx';
import { storedRunConfigRequest } from '../chat/hooks/useRunConfig.js';
import { BottomNav, TabPlaceholder } from './components/Shell.jsx';
import { AppToast } from './components/AppToast.jsx';
import {
  applyToolsSettingsPayloadToRecords,
  applyMemorySettingsPayloadToRecords,
  buildToolsSettingsPayload,
  buildMemorySettingsPayload,
  getSelectedLlmConfig,
  llmProviderRequestPayload,
} from '../settings/model/settings-payload.js';
import { API_BASE } from '../../shared/api/base.js';
import { useLiveToolsSettings } from '../settings/hooks/useLiveToolsSettings.js';
import { createSkillInventoryCache, isSkillPage } from '../settings/model/skill-inventory.js';
import {
  apiFetch,
  buildOwnerScopedStorageKey,
  buildRunConfigStorageKey,
  DEFAULT_SESSION_NAME,
  buildApiHeaders,
  parseResponseMessage,
  } from '../../shared/api/client.js';
import {
  APP_DEFAULT_AGENT_OPTIONS,
  DEFAULT_AGENT_SETTINGS,
  normalizeAgentSettings,
  agentCatalogFromProfiles,
  agentCatalogFromSettings,
  createDefaultCustomAgentPayload,
  withAlwaysAllowedAgentTools,
} from '../agents/model/agent-settings.js';
import {
  DEFAULT_WORKFLOW_SETTINGS,
  DIRECT_AGENT_WORKFLOW_ID,
} from '../workflow/model/workflow-defaults.js';
import {
  LLM_SETTINGS_STORAGE_KEY,
  loadLlmSettingsDraft,
  applyLlmSettingsPayloadToDraft,
  runtimeLlmProviderOptions,
} from '../settings/model/llm-settings.js';
import {
  SETTINGS_RECORDS_STORAGE_KEY,
  loadSettingsRecordsDraft,
  WEB_SEARCH_PROVIDER_OPTIONS,
} from '../settings/model/settings-records.js';
import {
  normalizeWorkflowSettings,
  createDefaultCustomWorkflowPayload,
  payloadForCustomWorkflow,
  workflowById,
} from '../workflow/model/workflow-catalog.js';
import {
  createEmptyContextUsage,
  createContextUsageTracker,
  loadStoredContextUsage,
  contextUsageFromConversationDetail,
  estimateContextUsageFromConversationDetail,
  latestContextUsageFromTasks,
  normalizeContextUsage,
  } from '../chat/model/context-usage.js';
import {
  generateHexId,
  setStoredConversationId,
  saveWorkspaceState,
  normalizeWorkspaceOrdering,
  workspaceStateWithTouchedConversation,
  findConversationById,
  findProjectByConversationId,
  titleFromTaskText,
  isDefaultConversationName,
  normalizeChatImageRefs,
  mergeChatImageRefs,
  createEmptyWorkspaceState,
  createDefaultProject,
  chatImageFallbacksByTaskIdFromMessages,
  timestampValue,
  taskUpdatedTimestamp,
  mergeConversationTasks,
  isTaskActuallyActive,
} from '../conversations/model/workspace-state.js';
import {
  isRunStateLive,
  settledTaskIds,
} from '../conversations/model/conversation-run-state.js';
import { isTaskLive } from '../conversations/model/conversation-status.js';
import { useConversationRunState } from '../conversations/hooks/useConversationRunState.js';
import {
  createEmptyTaskRuntimeState,
  createPendingTaskDraft,
  isPendingTaskId,
  buildTaskRuntimeRecord,
  taskSummaryToRuntimeTask,
  taskDetailToRuntimeTask,
  runtimeTaskToQuest,
  applyTerminalTaskState,
  isTerminalTaskStatus,
  normalizeTaskStatus,
  sortTaskIdsForRestore,
  taskHasAssistantStreamContent,
  taskFirstStreamTimestamp,
  upsertToolCall,
  } from '../tasks/model/task-runtime.js';
import {
  nextEarlierTaskRuntimeIds,
  pendingTaskRuntimeIds,
  staleTaskRuntimeIds,
} from '../tasks/model/task-runtime-paging.js';
import {
  buildChatTimeline,
  getChatProgressLine,
  appendChatProgressText,
  appendAnswerDelta,
  pendingTaskToQuest,
  getToolResponseTraceStatus,
} from '../chat/model/chat-timeline.js';
import {
  addTaskCompletionNotice,
  clearConversationCompletionNotices,
  clearReadTaskCompletionNotices,
  clearTaskCompletionNotice,
  conversationNoticesFromTasks,
  loadTaskCompletionNotices,
  mergeConversationReadCursors,
  saveTaskCompletionNotices,
  taskCompletionNoticeKey,
  taskNoticesByTaskId,
  terminalTaskNoticeStatus,
} from '../tasks/model/task-completion-notices.js';
import {
  normalizeRuntimeEvent, normalizeRuntimeEvents, resolveProviderMeta,
  toDisplayText, STREAM_EVENT_BATCH_MS, STREAM_IMMEDIATE_EVENT_TYPES,
  CHAT_FINAL_FOLLOWUP_EVENT_TYPES,
} from '../tasks/model/runtime-events.js';
const SettingsPage = React.lazy(() => import('../settings/components/SettingsPage.jsx').then((module) => ({ default: module.SettingsPage })));
import { WorkflowRuntimeEntry as WorkflowRuntimePage } from '../workflow/components/WorkflowRuntimeEntry.jsx';

import { createConversationHandlers } from '../conversations/hooks/createConversationHandlers.js';
import { createComposerHandlers } from '../chat/hooks/createComposerHandlers.js';
import { createSettingsHandlers } from '../settings/hooks/createSettingsHandlers.js';
import { createConversationRuntime } from '../conversations/hooks/createConversationRuntime.js';
import { SchedulesProvider } from '../schedules/components/SchedulesProvider.jsx';
import { createScheduleBinding } from '../schedules/model/schedule.js';
import { createScheduledRuntimeHandlers } from '../schedules/model/runtime-handlers.js';
import { createTaskStreamHandlers } from '../tasks/hooks/createTaskStreamHandlers.js';
import { createDeployHandlers } from '../tasks/hooks/createDeployHandlers.js';
import { createConversationActivationHandlers } from '../conversations/hooks/createConversationActivationHandlers.js';
import { createDraftConversationHandlers } from '../conversations/hooks/createDraftConversationHandlers.js';
import { usePerConversationDraft } from '../chat/hooks/usePerConversationDraft.js';
import { useConversationBootstrap } from '../conversations/hooks/useConversationBootstrap.js';
import { saveLastLocation } from '../conversations/model/last-location.js';
import { createWorkflowTaskSelectionHandler } from '../conversations/hooks/createWorkflowTaskSelectionHandler.js';
import { conversationHasSentMessage, sentTaskSummaries } from '../conversations/model/agent-binding.js';
import { useConversationListPolling } from '../conversations/hooks/useConversationListPolling.js';
import { useTaskRuntimePolling } from '../tasks/hooks/useTaskRuntimePolling.js';
import { useViewedTaskCompletionNotice } from '../tasks/hooks/useViewedTaskCompletionNotice.js';
import * as workspaceRuntime from './model/workspace-runtime.js';

const { useState, useEffect, useRef, useMemo } = React;

const TASK_COMPLETION_NOTICES_STORAGE_KEY = 'haish.task-completion-notices.v1';

export function AppShell() {
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
  const [windowFocused, setWindowFocused] = useState(() => (
    typeof document === 'undefined' ? true : document.hasFocus()
  ));
  const viewModeRef = useRef('chat');
  const conversationReorderChainsRef = useRef(new Map());
  const conversationReorderVersionsRef = useRef(new Map());
  const projectReorderChainRef = useRef(Promise.resolve());
  const projectReorderVersionRef = useRef(0);
  const modeLocationRef = useRef({ chat: null, workflow: null });
  const [busy, setBusy] = useState(false);
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
  const [toast, setToast] = useState(null);
  const [agentCatalog, setAgentCatalog] = useState(() => ({
    options: APP_DEFAULT_AGENT_OPTIONS,
    defaultAgentId: APP_DEFAULT_AGENT_OPTIONS[0].id,
  }));
  const [agentLoading, setAgentLoading] = useState(true);
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
  const toastTimerRef = useRef(null);
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
  useEffect(() => {
    const prune = () => {
      const evicted = evictInactiveRuntimes(runtimesRef.current, conversationId);
      if (evicted.size) setWorkspaceState((state) => releaseWorkspaceRuntimeDetails(state, evicted));
    };
    prune();
    const timer = window.setInterval(prune, 10000);
    return () => window.clearInterval(timer);
  }, [conversationId]);
  // While an SSE flush is happening this holds the conversation id that owns
  // the in-flight stream. Setters consult it before falling back to
  // `conversationIdRef.current`, so events from a now-backgrounded conversation
  // still write to *its* runtime (not the one currently shown). Acts as an
  // implicit dynamic context — set on flush enter, cleared on flush exit.
  const streamTargetConvIdRef = useRef(null);
  const contextUsageTracker = contextUsageTrackerRef.current || (
    contextUsageTrackerRef.current = createContextUsageTracker({
      getActiveConversationId: () => conversationIdRef.current,
      onChange: (usage) => setContextUsage(usage),
    })
  );

  function updateSettingsConnectionStatus(updater) {
    setSettingsConnectionStatus((prev) => (typeof updater === 'function' ? updater(prev) : updater));
  }

  /**
   * 表盘唯一写入入口（实时流 / 任务轮询 / 恢复分页 / 会话激活 / fork 都从这里进）。
   * 仲裁与落盘都在 createContextUsageTracker：当前显示的会话改 state + 落盘，别的
   * 会话（后台轮询 / 恢复）只落盘，切回去时直接复用同一份读数。
   */
  function applyContextUsage(candidate, options) {
    return contextUsageTracker.apply(candidate, options);
  }

  // 新建/切到空白会话时换一块空表盘（没人跑过任务就没有读数，也不写存储）。
  function resetContextUsage(conversationIdValue = null) {
    return contextUsageTracker.reset(conversationIdValue);
  }

  useEffect(() => {
    let cancelled = false;
    const workspaceQuery = localWorkspace.path
      ? `?workspace_path=${encodeURIComponent(localWorkspace.path)}`
      : '';
    setAgentLoading(true);
    apiFetch(`${API_BASE}/api/agents${workspaceQuery}`, { method: 'GET' }, { json: false })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const contextWindowTokens = Number(data?.runtime?.context_window_tokens) || 0;
        // 分母变了只换分母（分子仍是上一次实测值）；估算值不落盘。
        if (contextWindowTokens > 0) contextUsageTrackerRef.current?.setTotalTokens(contextWindowTokens);
        const catalog = agentCatalogFromProfiles(data);
        if (catalog.options.length > 0) setAgentCatalog(catalog);
      })
      .catch((error) => console.warn('failed to fetch assistant agents', error))
      .finally(() => {
        if (!cancelled) setAgentLoading(false);
    });
    return () => { cancelled = true; };
  }, [localWorkspace.path]);

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
  }, []);

  useLiveToolsSettings({
    enabled: needsToolsSettings,
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
    onPayload: payload => {
      setSettingsRecordsDraft(prev => applyToolsSettingsPayloadToRecords(prev,
        settingsSection !== 'tools' || isSkillPage(settingsSelection.tools) ? { skills: payload.skills } : payload));
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
  }, [needsAgentSettings]);
  useEffect(() => {
    if (!settingsMode || settingsSection !== 'workflow') return undefined;
    let cancelled = false;
    let retryTimer = null;
    const load = async (attempt = 0) => {
      try {
        const payload = await settingsApiRef.current.fetchWorkflowSettingsPayload();
        if (!cancelled) settingsApiRef.current.applyWorkflowSettingsPayload(payload);
      } catch (error) {
        if (cancelled) return;
        if (attempt < 4) {
          retryTimer = window.setTimeout(() => load(attempt + 1), 400 * (attempt + 1));
          return;
        }
        console.warn('failed to fetch workflow settings', error);
        runtimeApiRef.current.showToast?.('error', String(error?.message || error));
      }
    };
    load();
    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [settingsMode, settingsSection]);

  useEffect(() => {
    if (!settingsMode || (settingsSection !== 'llm' && settingsSection !== 'embedding')) return undefined;
    let cancelled = false;
    apiFetch(`${API_BASE}/api/settings/llm`, { method: 'GET' }, { json: false })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (cancelled || !payload) return;
        setLlmSettingsDraft((prev) => applyLlmSettingsPayloadToDraft(prev, payload));
      })
      .catch((error) => console.warn('failed to fetch llm settings', error));
    return () => { cancelled = true; };
  }, [settingsMode, settingsSection]);

  useEffect(() => {
    if (!settingsMode || settingsSection !== 'memory') return undefined;
    let cancelled = false;
    apiFetch(`${API_BASE}/api/settings/memory`, { method: 'GET' }, { json: false })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (cancelled || !payload) return;
        setSettingsRecordsDraft((prev) => applyMemorySettingsPayloadToRecords(prev, payload));
      })
      .catch((error) => console.warn('failed to fetch memory settings', error));
    return () => { cancelled = true; };
  }, [settingsMode, settingsSection]);

  useEffect(() => {
    let cleanup = null;
    let cancelled = false;
    const applyWindowState = (state) => {
      // 只有真正的 fullScreen 会隐藏 macOS 红黄绿按钮；maximize (zoom) 不会，
      // 所以 maximize 时仍要保留 topbar 左侧让位空间，否则 logo 被按钮压住。
      const chromeFree = Boolean(state?.fullScreen);
      document.body.classList.toggle('window-chrome-free', chromeFree);
    };
    window.haish?.getWindowState?.()
      .then((state) => {
        if (!cancelled) applyWindowState(state);
      })
      .catch(() => undefined);
    cleanup = window.haish?.onWindowStateChange?.(applyWindowState) || null;
    return () => {
      cancelled = true;
      cleanup?.();
      document.body.classList.remove('window-chrome-free');
    };
  }, []);

  const llmProviderOptions = useMemo(() => runtimeLlmProviderOptions(llmSettingsDraft), [llmSettingsDraft]);
  const agentOptions = agentCatalog?.options || APP_DEFAULT_AGENT_OPTIONS;
  const defaultAgentId = agentCatalog?.defaultAgentId || APP_DEFAULT_AGENT_OPTIONS[0].id;
  const runConfigStorageKey = buildRunConfigStorageKey(ownerId, 'chat', conversationId);
  const botRunConfigStorageKey = runConfigStorageKey ? `${runConfigStorageKey}.bot` : '';
  // 侧边栏的「Run again」没有输入框，用这个会话上次真正选过的模型配置；取不到就沿用
  // 来源 Task 的原请求参数。
  const sidebarRetryRunConfig = (task) => {
    const targetConversationId = task?.conversationId || task?.conversation_id;
    const baseKey = buildRunConfigStorageKey(ownerId, 'chat', targetConversationId);
    if (!baseKey || task?.executionMode === 'bot') return null;
    return storedRunConfigRequest(baseKey, llmProviderOptions);
  };
  const workflowOptions = useMemo(() => {
    const normalized = normalizeWorkflowSettings(workflowSettingsDraft);
    return [...normalized.presets, ...normalized.custom]
      .filter((item) => item.enabled !== false && item.executable && !item.draft)
      .map((item) => ({
        id: item.workflow_id,
        label: item.display_name || item.workflow_id,
        description: item.description || '',
        canUploadDocuments: item.can_upload_documents === true,
      }));
  }, [workflowSettingsDraft]);
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

  function persistStoredConversationId(nextConversationId) {
    setStoredConversationId(ownerIdRef.current, nextConversationId);
  }

  useEffect(() => {
    const onFocus = () => setWindowFocused(true);
    const onBlur = () => setWindowFocused(false);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  useEffect(() => {
    if (!ownerId) return;
    completionReportedTaskIdsRef.current.clear();
    const notices = loadTaskCompletionNotices(
      window.localStorage,
      buildOwnerScopedStorageKey(TASK_COMPLETION_NOTICES_STORAGE_KEY, ownerId),
    );
    setTaskCompletionNotices(notices);
    setTaskCompletionNoticesOwner(ownerId);
    window.haish?.setTaskCompletionBadgeCount?.(Object.keys(notices).length)
      .catch(() => undefined);
  }, [ownerId]);

  useEffect(() => {
    const storageKey = buildOwnerScopedStorageKey(TASK_COMPLETION_NOTICES_STORAGE_KEY, ownerId);
    if (!storageKey || taskCompletionNoticesOwner !== ownerId) return;
    saveTaskCompletionNotices(
      window.localStorage,
      storageKey,
      taskCompletionNotices,
    );
    window.haish?.setTaskCompletionBadgeCount?.(Object.keys(taskCompletionNotices).length)
      .catch(() => undefined);
  }, [ownerId, taskCompletionNotices, taskCompletionNoticesOwner]);

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
    updateConversationTitle,
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
    isDefaultConversationName,
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
    titleFromTaskText,
    updateTaskRuntimeState: (...args) => runtimeApiRef.current.updateTaskRuntimeState?.(...args),
    userCancelledTaskIdsRef,
    viewModeRef,
    workspaceState,
    workspaceStateWithConversationDetail: workspaceRuntime.workspaceStateWithConversationDetail,
  });

  draftApiRef.current = { materializeDraftConversationForSend };
  useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
  }, []);

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  useEffect(() => {
    if (!conversationError) return;
    setHollow({
      title: 'Conversation Load Error',
      result: conversationError,
      taskId: null,
    });
  }, [conversationError]);

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
    setShellSeeded,
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
    getTaskById,
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
    workspaceStateWithConversationDetail: workspaceRuntime.workspaceStateWithConversationDetail,
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

  useConversationBootstrap({
    activationApiRef,
    buildWorkspaceStateFromProjects: workspaceRuntime.buildWorkspaceStateFromProjects,
    ownerIdRef,
    setConversationError,
    setConversationReady,
    setOwnerId,
    setWorkspaceLoading,
    setWorkspaceState,
    setViewedWorkflowTask,
  });

  useEffect(() => {
    if (workspaceLoading || !ownerId) return undefined;
    const save = () => saveLastLocation(window.localStorage, ownerId, viewMode, viewedWorkflowTask);
    save();
    window.addEventListener('pagehide', save);
    return () => window.removeEventListener('pagehide', save);
  }, [workspaceLoading, ownerId, viewMode, viewedWorkflowTask]);

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
    LLM_SETTINGS_STORAGE_KEY,
    SETTINGS_RECORDS_STORAGE_KEY,
    WEB_SEARCH_PROVIDER_OPTIONS,
    activeTab,
    skillConversationId: conversationId?.startsWith('draft-') ? '' : conversationId || '',
    invalidateSkillInventory: () => skillInventoryCacheRef.current.invalidate(),
    agentCatalogFromSettings,
    agentSettingsDraft,
    applyLlmSettingsPayloadToDraft,
    applyMemorySettingsPayloadToRecords,
    applyToolsSettingsPayloadToRecords: (records, payload) => {
      if (skillInventoryKeyRef.current === skillInventoryKey) return applyToolsSettingsPayloadToRecords(records, payload);
      return applyToolsSettingsPayloadToRecords(records, { ...payload, skills: undefined });
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
    setAgentCatalog,
    setAgentSettingsDraft,
    setSettingsMode,
    setLlmSettingsDraft,
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
    conversationIdRef,
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
    API_BASE,
    CHAT_FINAL_FOLLOWUP_EVENT_TYPES,
    STREAM_EVENT_BATCH_MS,
    STREAM_IMMEDIATE_EVENT_TYPES,
    activeRuntimeTargetConvId,
    appendAnswerDelta,
    appendChatProgressText,
    applyConversationSnapshot,
    applyContextUsage,
    batchRuntimeMutations,
    applyTerminalTaskState,
    apiFetch,
    buildApiHeaders,
    chatFinalizedTaskIdsRef,
    conversationId,
    conversationIdRef,
    ensureTaskForEvent,
    eventDeltaText,
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
    readRuntimeAnswerBuffer,
    // Late-bound: defined by createDeployHandlers later in the render body.
    removeConversationTaskFromWorkspace: (...args) => deployApiRef.current.removeConversationTaskFromWorkspace?.(...args),
    resolveProviderMeta,
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
    executeQuest, workflowById, workflowSettingsDraft, setSelectedWorkflowId,
    API_BASE,
    DEFAULT_SESSION_NAME,
    activateConversationDetail,
    activateConversationShell,
    applyConversationSnapshot,
    apiFetch,
    buildApiHeaders,
    replaceWorkspaceModeFromProjects: workspaceRuntime.replaceWorkspaceModeFromProjects,
    conversationReorderChainsRef,
    conversationReorderVersionsRef,
    projectReorderChainRef,
    projectReorderVersionRef,
    // Late-bound: createDeployHandlers runs after this factory (selection pending deps).
    buildDeployRequest: (...args) => deployApiRef.current.buildDeployRequest?.(...args),
    conversationError,
    setConversationError,
    settingsMode,
    canStartDeployForConversation: (...args) => deployApiRef.current.canStartDeployForConversation?.(...args),
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
    getRuntime,
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
    workspaceStateWithConversationDetail: workspaceRuntime.workspaceStateWithConversationDetail,
  });
  // 列表轮询发现当前会话消失：和处理恢复 404 的是同一条路（换目标或开空白对话）。
  directorySelectionApiRef.current.handleActiveConversationRemoved = handleConversationRemoved;
  useConversationListPolling({
    activeConversationExecutionMode: findConversationById(workspaceState, conversationId)?.executionMode || null,
    conversationIdRef,
    directorySelectionApiRef,
    draftConversationRef,
    enabled: conversationReady && !settingsMode,
    executionMode: viewMode === 'chat' ? 'chat' : 'bot',
    replaceWorkspaceModeFromProjects: workspaceRuntime.replaceWorkspaceModeFromProjects,
    setWorkspaceState,
  });
  const quests = useMemo(() => {
    const confirmedTasks = taskRuntimeState.taskOrder
      .map((taskId) => taskRuntimeState.tasksById[taskId])
      .filter(Boolean)
      .map(runtimeTaskToQuest);
    return taskRuntimeState.pendingTask
      ? [...confirmedTasks, pendingTaskToQuest(taskRuntimeState.pendingTask)]
      : confirmedTasks;
  }, [taskRuntimeState]);
  const selectedConversationId = workspaceState.activeConversationId || null;
  const conversationSelectionPending = Boolean(
    selectedConversationId
    && conversationId
    && selectedConversationId !== conversationId
  );

  const {
    removeConversationTaskFromWorkspace,
    handleStop,
    buildDeployRequest,
    canStartDeployForConversation,
    failPendingDeploy,
    startDeploy,
    handleDeploy,
  } = createDeployHandlers({
    uploadChatImage,
    APP_DEFAULT_AGENT_OPTIONS,
    applyTerminalTaskState,
    busy,
    cancelActiveConversationTask,
    cancelActiveTask,
    queueTaskInput,
    chatFinalizedTaskIdsRef,
    conversationDetailToWorkspaceConversation: workspaceRuntime.conversationDetailToWorkspaceConversation,
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
    updateConversationTitle,
    updateTaskById,
    updateTaskRuntimeState,
    userCancelledTaskIdsRef,
    viewMode,
    viewModeRef,
    workflowSettingsDraft,
    workspaceState,
    workspaceStateWithConversationDetail: workspaceRuntime.workspaceStateWithConversationDetail,
    workspaceStateWithTouchedConversation,
  });
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

  const panelWorkspaceState = useMemo(() => normalizeWorkspaceOrdering({
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
  }), [workspaceState, conversationId, quests]);
  const visibleConversationMode = viewMode === 'chat' ? 'chat' : 'bot';
  const visiblePanelWorkspaceState = useMemo(() => ({
    ...panelWorkspaceState,
    activeConversationId: findConversationById(panelWorkspaceState, conversationId)?.executionMode === visibleConversationMode
      ? conversationId
      : null,
    projects: panelWorkspaceState.projects
      .filter((project) => project.executionMode === visibleConversationMode)
      .map((project) => ({
        ...project,
        conversations: project.conversations.filter(
          (conversation) => conversation.executionMode === visibleConversationMode,
        ),
      })),
  }), [panelWorkspaceState, conversationId, visibleConversationMode]);
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
  useEffect(() => {
    if (!queuedDeploy) return;
    if (!deployApiRef.current.canStartDeployForConversation?.(queuedDeploy.targetConversationId)) return;
    if (currentConversationRunning || uploadState.active || settingsMode) return;
    const request = queuedDeploy;
    // Draft first-send path: materialize server conversation before streaming.
    if (draftConversationRef.current) {
      setQueuedDeploy(null);
      draftApiRef.current.materializeDraftConversationForSend(request)
        .then((materialized) => {
          const realConversationId = materialized?.id || null;
          if (!realConversationId) return;
          request.targetConversationId = realConversationId;
          request.runtimeConversationId = realConversationId;
          // Creation may finish after navigation. The accepted send belongs
          // to its own runtime and must continue without selecting that chat.
          deployApiRef.current.startDeploy?.(request, realConversationId, materialized?.detail || null);
        })
        .catch((error) => {
          console.error('draft conversation create failed', error);
          deployApiRef.current.failPendingDeploy?.(request, error);
          runtimeApiRef.current.showToast?.('error', String(error?.message || error));
        });
      return;
    }
    const deployConvId = request.targetConversationId || conversationIdRef.current || conversationId;
    if (!deployConvId || String(deployConvId).startsWith('draft-')) return;
    setQueuedDeploy(null);
    deployApiRef.current.startDeploy?.(request, deployConvId);
  }, [
    queuedDeploy,
    conversationReady,
    conversationSelectionPending,
    conversationError,
    currentConversationRunning,
    uploadState.active,
    settingsMode,
    conversationId,
  ]);
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
  const runtimeCurrentTask = useMemo(() => {
    if (taskRuntimeState.activeTaskId && taskRuntimeState.tasksById[taskRuntimeState.activeTaskId]) {
      return taskRuntimeState.tasksById[taskRuntimeState.activeTaskId];
    }
    if (taskRuntimeState.pendingTask) {
      return null;
    }
    const latestTaskId = taskRuntimeState.taskOrder[taskRuntimeState.taskOrder.length - 1];
    return latestTaskId ? taskRuntimeState.tasksById[latestTaskId] || null : null;
  }, [taskRuntimeState]);
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
  const nodeConfigSelection = useNodeRuntimeConfigs(botRunConfigStorageKey, selectedWorkflow, currentWorkflowTask?.nodeRuntimeConfigs, currentWorkflowTask?.taskId);
  const botNodeConfigs = nodeConfigSelection.configs;
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
  useEffect(() => {
    const activeTaskId = taskRuntimeState.activeTaskId;
    if (!activeTaskId || !runtimeCurrentTask) return;
    if (isTaskActuallyActive(runtimeCurrentTask)) return;
    if (!busy && !currentConversationActive) return;
    // This sanity reset only ever applies to the conversation currently shown
    // — `taskRuntimeState` is the mirror of the displayed runtime.
    runtimeApiRef.current.setRuntimeBusy?.(false);
    runtimeApiRef.current.setRuntimeActiveTaskId?.(null);
    runtimeApiRef.current.setRuntimeFetchController?.(null);
    runtimeApiRef.current.updateTaskRuntimeState?.((state) => (
      state.activeTaskId === activeTaskId
        ? { ...state, activeTaskId: null }
        : state
    ));
  }, [busy, currentConversationActive, runtimeCurrentTask, taskRuntimeState.activeTaskId]);
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
  const activeTaskText = useMemo(() => {
    const activeTaskId = taskRuntimeState.activeTaskId;
    if (activeTaskId && taskRuntimeState.tasksById[activeTaskId]?.title) {
      return taskRuntimeState.tasksById[activeTaskId].title;
    }
    if (taskRuntimeState.pendingTask?.title) {
      return taskRuntimeState.pendingTask.title;
    }
    return '';
  }, [taskRuntimeState]);
  // Older turns keep their summary until the user scrolls up to them, so the
  // conversation no longer replays every task event log on open.
  const pendingEarlierTaskRuntimeIds = useMemo(
    () => pendingTaskRuntimeIds(taskRuntimeState.taskOrder, taskRuntimeState.tasksById),
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
    // 这份拷贝的游标可能停在半路（甚至对不上文件），丢掉缓存做一次全量回放——和
    // 「切走再切回来」走的是同一条恢复路径。逐条重建：任务真的没了只移除它自己。
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
      taskRuntimeEventCacheRef.current.delete(taskId);
      rebuild(taskId);
    }
  }, [conversationId, settledRuntimeTaskIds, taskRuntimeState]);
  const loadEarlierTaskRuntimes = async (targetConversationId) => {
    if (!targetConversationId || conversationIdRef.current !== targetConversationId) return;
    const activationSeq = conversationActivationSeqRef.current;
    const runtimeState = getRuntime(targetConversationId)?.taskRuntimeState;
    const taskIds = nextEarlierTaskRuntimeIds(runtimeState?.taskOrder, runtimeState?.tasksById);
    if (taskIds.length === 0) return;
    return restoreTaskRuntimes(taskIds, {
      targetConversationId,
      isCurrentActivation: () => conversationIdRef.current === targetConversationId
        && isConversationActivationCurrent(activationSeq),
    });
  };
  const chatMessages = useMemo(() => {
    const rows = [];
    // 助手气泡上的名字跟着会话选定的 agent 走（见 chat/model/assistant-name.js）。
    const agentNameFor = (task) => assistantNameForTask(task, currentConversation, agentOptions);
    // 本地还没被服务端接下的那一轮（pending，见 conversations/model/agent-binding.js）
    // 在时间线上照旧渲染；被它顶掉的那一轮必须在同一刻让位。编辑 / 重发刚被接下时旧行
    // 还留在上面（编辑框正悬在那一行上），新的运行态却在下面另起一轮——看起来就是输入框
    // 错位。空壳（本地取消、服务端一个字都没收到）不渲染，也不顶掉任何一轮。
    const pendingTurn = taskRuntimeState.pendingTask;
    const pendingStatus = pendingTurn ? normalizeTaskStatus(pendingTurn.status) : '';
    const pendingError = String(pendingTurn?.error || '').trim();
    const pendingTurnVisible = Boolean(pendingTurn
      && !taskRuntimeState.activeTaskId
      && !(pendingStatus === 'cancelled' && !pendingError && !taskHasAssistantStreamContent(pendingTurn)));
    const orderedTasks = collapseFullTaskAttempts(
      taskRuntimeState.taskOrder.map((taskId) => taskRuntimeState.tasksById[taskId]).filter(Boolean),
      pendingTurnVisible ? pendingTurn : null,
    );
    const settled = settledRuntimeTaskIds;
    const rowCache = chatMessageRowsCacheRef.current;
    for (const task of orderedTasks) {
      const taskId = task.taskId || task.id || task.title;
      const live = isTaskLive(task) && !settled.has(String(task.taskId || task.id || ''));
      const agentName = agentNameFor(task);
      const cachedRows = rowCache.get(task);
      // catalog 是异步到的：名字也会变，所以名字一起比，不能只比 live。
      if (cachedRows && cachedRows.live === live && cachedRows.agentName === agentName) {
        rows.push(...cachedRows.rows);
        continue;
      }
      const taskRows = [];
      const status = normalizeTaskStatus(task.status);
      const answer = String(task.answerText || '').trim();
      const progress = String(task.chatStreamText || '').trim();
      const error = String(task.error || '').trim();
      // Keep cancelled turns, including those stopped before the first token,
      // so the original user message remains available for edit-and-resend.
      if (task.title || task.annotations?.length) {
        taskRows.push({
          id: `${taskId}-user`,
          taskId,
          conversationId,
          messageId: task.userMessageId,
          role: 'user',
          text: stripInjectedSkillInstruction(task.displayText ?? task.title),
          annotations: task.annotations || [],
          status,
          createdAt: task.createdAt,
          completedAt: task.completedAt,
          images: Array.isArray(task.imageAttachments) ? task.imageAttachments : [],
        });
      }
      if (!(task.inherited && status === 'cancelled') && (answer || progress || error || status === 'running' || status === 'queued' || status === 'failed' || status === 'cancelled')) {
        const progressLines = progress
          ? progress.split('\n').map((line) => line.trim()).filter(Boolean)
          : [];
        const hasTraceSource = status === 'running'
          || status === 'queued'
          || progressLines.length > 0
          || (Array.isArray(task.eventLog) && task.eventLog.length > 0)
          || (Array.isArray(task.toolCalls) && task.toolCalls.length > 0);
        const timeline = hasTraceSource ? buildChatTimeline(task, status) : null;
        const streaming = live;
        const timelineItems = Array.isArray(timeline?.items) ? timeline.items : [];
        // Older turns keep only their summary until the user scrolls up to them.
        // Such a turn has no trace to read its content from, so a cancelled run
        // falls back to the persisted answer instead of rendering blank.
        const traceHydrated = task.runtimeHydrated !== false;
        // Keep streamed answer segments in the trace so text and tool calls
        // stay in their original chronological order. The final answer moves
        // into the Markdown bubble only after the run completes.
        // Cancelled runs should not render a separate final-answer body or a
        // synthetic "Task was cancelled." message. Keep the chronological trace
        // intact, though: it is the running process (LLM stream + tool calls)
        // the user saw before pressing Stop.
        const bubbleText = streaming
          ? ''
          : (status === 'cancelled' && traceHydrated ? '' : (error || answer));
        // Mid-run steering inputs ("user_input" timeline items) stay inside the
        // assistant trace — they do NOT become standalone user bubbles. The
        // correction embeds inline in the interrupted assistant box and the
        // assistant's follow-up reply to it continues below, so the whole
        // exchange reads as one continuous dialogue bubble instead of three
        // blocks. All items keep their original chronological order.
        taskRows.push({
          id: `${taskId}-agent`,
          messageId: task.assistantMessageId,
          taskId,
          conversationId,
          role: 'agent',
          agentName,
          text: bubbleText,
          progressLines,
          traceTimeline: timelineItems,
          traceHydrated,
          traceLatestTodos: timeline?.latestTodos || null,
          status,
          streaming,
          createdAt: task.createdAt,
          completedAt: task.completedAt,
          firstTokenAt: taskFirstStreamTimestamp(task),
        });
      }
      rowCache.set(task, { rows: taskRows, live, agentName });
      rows.push(...taskRows);
    }
    if (pendingTurnVisible) {
      // 服务端还没接下这一笔（见 conversations/model/agent-binding.js）：标记出来，
      // agent 锁不把它当「发过消息」。它照旧留在时间线上等重发。
      rows.push({
        id: `${pendingTurn.id || 'pending'}-user`,
        role: 'user',
        unaccepted: true,
        text: stripInjectedSkillInstruction(pendingTurn.displayText ?? pendingTurn.title),
        annotations: pendingTurn.annotations || [],
        status: pendingStatus,
        createdAt: pendingTurn.createdAt,
        completedAt: pendingTurn.completedAt,
        images: Array.isArray(pendingTurn.imageAttachments) ? pendingTurn.imageAttachments : [],
      });
      if (pendingError || pendingStatus === 'failed' || pendingStatus === 'cancelled' || pendingStatus === 'running' || pendingStatus === 'queued') {
        const pendingStreaming = isTaskLive(pendingTurn)
          && !settled.has(String(pendingTurn.taskId || pendingTurn.id || ''));
        rows.push({
          id: `${pendingTurn.id || 'pending'}-agent`,
          taskId: pendingTurn.id || '',
          conversationId,
          role: 'agent',
          agentName: agentNameFor(pendingTurn),
          text: pendingStreaming ? '' : (pendingStatus === 'cancelled' ? '' : pendingError),
          progressLines: [],
          traceTimeline: [],
          status: pendingStatus,
          streaming: pendingStreaming,
          createdAt: pendingTurn.createdAt,
          completedAt: pendingTurn.completedAt,
          firstTokenAt: taskFirstStreamTimestamp(pendingTurn),
        });
      }
    }
    return rows;
  }, [agentOptions, conversationId, currentConversation, settledRuntimeTaskIds, taskRuntimeState]);
  // 会话正文还在路上：这份时间线是工作区快照搭的（只有标题和状态），会话详情和任务运行
  // 记录都还没回来。这属于「整段会话在加载」，所以由会话面板在正中间整块占位（见
  // chat/components/ChatPanel.jsx 的 loading），而不是在每一轮助手气泡里各转一个圈。
  const conversationLoading = conversationContentLoading({
    shellSeeded,
    rowCount: chatMessages.length,
    draft: Boolean(draftConversationRef.current),
    error: conversationError,
  });
  const lockedAgentId = currentConversation?.agentId
    || currentConversation?.tasks?.find((task) => task?.requestedAgentId)?.requestedAgentId
    || '';
  // 锁的判据只有一份（见 conversations/model/agent-binding.js）：发过消息就锁，
  // 只是传过文件（解析文档）不算。还只在本机的那一笔（本地 pending：排队 / 失败 /
  // 取消）同样不算——服务端一个字都没收到：会话行上的乐观写入要被 sentTaskSummaries
  // 摘掉，时间线上它那一行用户气泡带 unaccepted 标记。
  const agentSelectionLocked = conversationHasSentMessage({
    tasks: sentTaskSummaries(currentConversation?.tasks, taskRuntimeState.pendingTask),
    hasUserTurn: chatMessages.some((message) => message.role === 'user' && !message.unaccepted),
  });
  const agentLockedReason = agentSelectionLocked ? 'Cannot change agent for this conversation.' : '';
  const submitPending = Boolean(queuedDeploy);

  const composerDisabled = uploadState.active
    || settingsMode
    || !!conversationError
    || (viewMode !== 'chat' && currentConversationRunning);

  // 一次性加载（项目/会话同步）完成前：整屏只显示居中的 Haish logo
  // （呼吸光晕 + 光环脉冲动效），不渲染顶栏/侧边栏等任何其他 UI（参考设计稿）。
  if (workspaceLoading) {
    return (
      <div className="app-shell app-shell-loading">
        <div className="app-splash">
          <img
            className="app-splash-logo"
            src="assets/ui/penguin_logo_user.png"
            alt=""
            draggable={false}
          />
        </div>
      </div>
    );
  }

  const scheduleRuntime = createScheduledRuntimeHandlers({ applyScheduledEvent, ensureConversationRuntime, restoreLatestTaskRuntime, flushRuntimeTasksToWorkspace, getRuntime, setRuntimeBusy, isTaskActuallyActive });
  return (
    <SchedulesProvider currentConversationId={conversationId} ensureConversation={createScheduleBinding(materializeDraftConversationForSend, conversationIdRef)} onRuntimeEvent={scheduleRuntime.event} onRecover={scheduleRuntime.recover}>
    <div className="app-shell">
      <MetalFxRuntimeKeeper />
      <TopBar
        viewMode={viewMode}
        onToggleViewMode={() => {
          try {
            handleToggleViewMode();
          } catch (error) {
            showToast('error', String(error?.message || error));
          }
        }}
        settingsActive={settingsMode}
        onToggleSettings={handleToggleSettings}
      />
      <div className={`app-body ${settingsMode ? 'settings-mode' : viewMode === 'chat' ? 'chat-mode' : 'workflow-mode'} ${!settingsMode && conversationPanelCollapsed ? 'conversations-collapsed' : ''}`}>
        {settingsMode ? (
          <React.Suspense fallback={<div className="app-body-loading"><LoadingState role="status" label="Loading settings…" /></div>}>
          <SettingsPage
            activeSection={settingsSection}
            onSectionChange={setSettingsSection}
            selectionBySection={settingsSelection}
            onSelectionChange={setSettingsSelection}
            llmDraft={llmSettingsDraft}
            onLlmDraftChange={setLlmSettingsDraft}
            records={settingsRecordsDraft}
            toolsSettingsState={toolsSettingsState}
            onRefreshTools={() => toolsRefreshRef.current?.()}
            onRecordsChange={setSettingsRecordsDraft}
            agentSettings={agentSettingsDraft}
            agentSettingsLoading={!agentSettingsReady}
            onAutomationExpandedChange={setAutomationExpanded}
            onSkillsExpandedChange={setSkillsExpanded}
            onAgentSettingsChange={setAgentSettingsDraft}
            workflowSettings={workflowSettingsDraft}
            onWorkflowSettingsChange={setWorkflowSettingsDraft}
            onSave={handleSaveSettingsDraft}
            onSaveTools={handleSaveToolsSettingsDraft} onToast={showToast}
            onDeleteLlmProvider={handleDeleteLlmProvider}
            onToggleLlmProvider={handleToggleLlmProvider}
            onTogglePresetAgent={handleTogglePresetAgent}
            onCreateCustomAgent={handleCreateCustomAgent}
            onSaveCustomAgent={handleSaveCustomAgent}
            onDeleteCustomAgent={handleDeleteCustomAgent}
            onTogglePresetWorkflow={handleTogglePresetWorkflow}
            onCreateCustomWorkflow={handleCreateCustomWorkflow}
            onSaveCustomWorkflow={handleSaveCustomWorkflow}
            onDeleteCustomWorkflow={handleDeleteCustomWorkflow}
            onTestLlmConfig={handleTestLlmConfig}
            onTestWebProvider={handleTestWebProvider}
            onTestSettingsConnection={handleTestSettingsConnection}
            onSettingsConnectionDirty={handleSettingsConnectionDirty}
            settingsConnectionStatus={settingsConnectionStatus}
            onInstallSkill={handleInstallSkillPackage}
            onToggleSkill={handleToggleSkill}
            onUninstallSkill={handleUninstallSkill}
            skillActionBusy={skillActionBusy}
            openEditorRequest={pendingSettingsEditor}
            onOpenEditorRequestConsumed={() => setPendingSettingsEditor(null)}
          />
          </React.Suspense>
        ) : activeTab === 'dashboard' ? (
          <>
            <ConversationsPanel
              workspaceState={visiblePanelWorkspaceState}
              terminalNotices={conversationNoticesFromTasks(taskCompletionNotices)}
              taskTerminalNotices={taskNoticesByTaskId(taskCompletionNotices)}
              windowFocused={windowFocused}
              acknowledgeActiveConversation={viewMode === 'chat'}
              onViewConversationCompletions={markConversationTaskCompletionsViewed}
              collapsed={conversationPanelCollapsed}
              onToggleCollapsed={() => setConversationPanelCollapsed((collapsed) => !collapsed)}
              onToast={showToast}
              onAddProject={() => { handleAddProject().catch((error) => { console.error('project add failed', error); showToast('error', String(error?.message || error)); }); }}
              onSelectProject={(projectId) => { handleSelectProject(projectId).catch((error) => { console.error('project select failed', error); showToast('error', String(error?.message || error)); }); }}
              onToggleProject={handleToggleProject}
              onRemoveProject={(projectId) => {
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
              }}
              onAddConversation={(projectId) => { handleAddConversation(projectId).catch((error) => { console.error('conversation add failed', error); showToast('error', String(error?.message || error)); }); }}
              onSelectConversation={(projectId, nextConversationId) => { handleSelectConversation(projectId, nextConversationId).catch((error) => { console.error('conversation select failed', error); showToast('error', String(error?.message || error)); }); }}
              onSelectTask={(projectId, targetConversationId, task) => { handleSelectWorkflowTask(projectId, targetConversationId, task).catch((error) => { console.error('task select failed', error); showToast('error', String(error?.message || error)); }); }}
              showTaskRecords={viewMode === 'chat'}
              workflowTaskMode={viewMode !== 'chat'}
              activeTaskId={currentWorkflowTask?.taskId || currentWorkflowTask?.id || null}
              onToggleConversationTasks={handleToggleConversationTasks}
              onToggleProjectConversations={handleToggleProjectConversations}
              onDeleteConversation={(projectId, nextConversationId) => {
                return handleDeleteConversation(projectId, nextConversationId)
                  .then(() => markConversationTaskCompletionsViewed(nextConversationId));
              }}
              onDeleteTask={handleDeleteWorkflowTask}
              onRenameConversation={handleRenameConversation}
              onRenameProject={handleRenameProject}
              onPinConversation={handlePinConversation}
              onPinProject={handlePinProject}
              onReorderConversations={handleReorderConversations}
              onReorderProjects={handleReorderProjects}
              onOpenTaskReport={handleOpenTaskReport}
              onRetryTask={(task) => handleRetryTask(task, null, sidebarRetryRunConfig(task))}
            />
            {viewMode === 'chat' ? (
              <div className="app-chat-stage">
                <div className="app-chat-main">
	                  <ChatPanel
	                    conversationId={conversationId}
                        approvalDraft={Boolean(draftConversationRef.current && !draftConversationRef.current.serverCreated)}
                        ensureApprovalConversation={ensureServerConversationForActiveDraft}
	                    earlierTaskRuntimesPending={pendingEarlierTaskRuntimeIds.length > 0}
	                    onLoadEarlierTasks={loadEarlierTaskRuntimes}
	                    composerScopeId={draftConversationRef.current?.composerScopeId || conversationId}
	                    messages={chatMessages}
	                    loading={conversationLoading}
	                    running={currentConversationRunning}
	                    disabled={composerDisabled}
	                    submitPending={submitPending}
	                    onSend={handleDeploy}
                    onGoalCommand={handleGoalCommand}
                    onStop={handleStop}
                    onSelectFile={(file, selectedAgentId) => { handleAttachmentSelect(file, selectedAgentId, 'chat').catch((error) => console.error('attachment upload failed', error)); }}
                    onClearFile={handleAttachmentClear}
                    imageDrafts={composerImageDraftsRef.current}
                    attachment={composerAttachment}
                    uploading={uploadState.active}
                    contextUsage={contextUsage}
                    workspacePath={localWorkspace.path}
                    homePath={window.haish?.homePath || ''}
                    activeTaskText={activeTaskText}
                    providerOptions={llmProviderOptions}
                    agentOptions={agentOptions}
                    defaultAgentId={defaultAgentId}
                    agentLoading={agentLoading}
                    agentLocked={agentSelectionLocked}
                    agentLockedReason={agentLockedReason}
                    lockedAgentId={lockedAgentId}
                    selectionStorageKey={runConfigStorageKey}
                    draft={chatDraft}
	                    onDraftChange={setChatDraft}
                    onForkMessage={handleForkMessage}
                    onEditMessage={(taskId, text, runConfig) => handleRetryTask(getTaskById(taskId, conversationId), text, runConfig)}
                    onRetryTask={(taskId, runConfig) => {
                      const pendingTask = taskRuntimeState.pendingTask;
                      const pendingTaskId = pendingTask?.taskId || pendingTask?.id;
                      return handleRetryTask(
                        getTaskById(taskId, conversationId)
                        || (pendingTaskId === taskId ? pendingTask : null),
                        null,
                        runConfig,
                      );
                    }}
		                  />
	                </div>
	              </div>
	            ) : (
	              <div className="app-workflow-stage">
                  <WorkflowRuntimePage
                    loading={conversationLoading}
                    workflow={selectedWorkflow}
                    task={currentWorkflowTask}
                    agentOptions={agentOptions}
                    onOpenConfig={openWorkflowConfig}
                    {...{ providerOptions: llmProviderOptions, nodeRuntimeConfigs: currentConversationRunning ? (currentWorkflowTask?.nodeRuntimeConfigs || {}) : botNodeConfigs, onNodeRuntimeConfigChange: nodeConfigSelection.change, configReadOnly: currentConversationRunning || submitPending }}
                    onRetry={(nodeId) => {
                      if (!currentWorkflowTask) return;
                      setViewedWorkflowTask(null);
                      executeWorkflowNodeRerun(currentWorkflowTask, nodeId, selectedWorkflow?.nodes?.find((node) => node.id === nodeId)?.type === 'agent' ? nodeRuntimeConfigRequest(botNodeConfigs[nodeId]) : null).catch((error) => {
                        console.error('workflow node rerun failed', error);
                        showToast('error', String(error?.message || error));
                      });
                    }}
                    composer={<ChatComposer
                      conversationId={conversationId}
                      approvalDraft={Boolean(draftConversationRef.current && !draftConversationRef.current.serverCreated)}
                      ensureApprovalConversation={ensureServerConversationForActiveDraft}
                      executionMode="bot"
                      scheduleNodeRuntimeConfigs={nodeConfigSelection.conversationConfigs} onRestoreNodeConfigs={nodeConfigSelection.restore}
                      scopeId={draftConversationRef.current?.composerScopeId || conversationId}
                      draft={chatDraft}
                      onDraftChange={setChatDraft}
                      onSend={(...args) => handleDeploy(...args, botNodeConfigs)}
                      onStop={handleStop}
                      activeTaskText={activeTaskText}
                      running={currentConversationRunning}
                      disabled={composerDisabled}
                      submitPending={submitPending}
                      idlePlaceholder="Describe the task you want to delegate..."
                      disabledPlaceholder="Agents are currently busy executing..."
                      allowRuntimeInput={false}
                      attachment={composerAttachment}
                      contextTask={contextTask}
                      onClearContextTask={() => setContextTask(null)}
                      uploading={uploadState.active}
                      onSelectFile={(file, selectedWorkflowId) => { handleAttachmentSelect(file, selectedWorkflowId, 'bot').catch((error) => console.error('attachment upload failed', error)); }}
                      onClearFile={handleAttachmentClear}
                      providerOptions={llmProviderOptions}
                      agentOptions={workflowOptions}
                      defaultAgentId={defaultWorkflowId}
                      agentLoading={workflowLoading}
                      selectionStorageKey={botRunConfigStorageKey}
                      onAgentChange={setSelectedWorkflowId}
                      contextUsage={contextUsage}
                    />}
                  />
	              </div>
            )}
          </>
        ) : (
          <div className="app-tab-stage">
            <div className="app-tab-main">
              <TabPlaceholder name={activeTab} />
            </div>
            <BottomNav active={activeTab} onChange={setActiveTab} />
          </div>
        )}
      </div>

      {toast && <AppToast kind={toast.kind} message={toast.message} />}

      <ResultDialog open={!!hollow} title={hollow?.title} result={hollow?.result} onClose={() => setHollow(null)}
        onUseAsContext={hollow?.contextSource
          ? () => { setContextTask(hollow.contextSource); setHollow(null); }
          : undefined} />
    </div></SchedulesProvider>
  );
}
