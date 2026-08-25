// @haish-esm
import React from 'react';
import {
  STATIONS,
  NAV_POINTS,
  MEET_POINTS,
  ROUTES,
  KIND_COLORS,
} from '../../lib/world-layout.js';
import { HollowPurple } from '../../Effects.jsx';
import { stripInjectedSkillInstruction } from '../../lib/chat-text.js';
import {
  TopBar,
  ConversationsPanel,
  ChatPanel,
  TaskDelegation,
  TabPlaceholder,
  BottomNav,
  } from '../../panels.jsx';
import { SettingsPage } from '../settings/SettingsPage.jsx';
import {
  applyToolsSettingsPayloadToRecords,
  applyMemorySettingsPayloadToRecords,
  applyKnowledgeSettingsPayloadToRecords,
  buildToolsSettingsPayload,
  buildMemorySettingsPayload,
  buildKnowledgeSettingsPayload,
  getSelectedLlmConfig,
  llmProviderRequestPayload,
} from '../settings/settings-payload.js';
import { API_BASE } from '../../api/base.js';
import {
  authFetch,
  buildRunConfigStorageKey,
  DEFAULT_PROJECT_ID,
  DEFAULT_SESSION_NAME,
  buildApiHeaders,
  parseResponseMessage,
  } from '../../api/auth.js';
import {
  APP_DEFAULT_AGENT_OPTIONS,
  DEFAULT_AGENT_SETTINGS,
  DEFAULT_WORKFLOW_SETTINGS,
  LLM_SETTINGS_STORAGE_KEY,
  SETTINGS_RECORDS_STORAGE_KEY,
  normalizeAgentSettings,
  agentCatalogFromProfiles,
  agentCatalogFromSettings,
  loadLlmSettingsDraft,
  loadSettingsRecordsDraft,
  loadSettingsConnectionStatus,
  persistSettingsConnectionStatus,
  applyLlmSettingsPayloadToDraft,
  runtimeLlmProviderOptions,
  settingsConnectionSignatureFor,
  sanitizeSettingsConnectionStatus,
  createDefaultCustomAgentPayload,
  DIRECT_AGENT_WORKFLOW_ID,
  WEB_SEARCH_PROVIDER_OPTIONS,
  withAlwaysAllowedAgentTools,
  } from '../../lib/agent-catalog.js';
import {
  normalizeWorkflowSettings,
  createDefaultCustomWorkflowPayload,
  payloadForCustomWorkflow,
  workflowById,
} from '../../lib/workflow-catalog.js';
import {
  MAP_W,
  MAP_H,
  DEFAULT_WALK_SPEED_PX_PER_SEC,
  WALK_SPEED_BY_ACTOR,
  DEFAULT_WALK_MIN_DURATION_MS,
  WALK_MIN_DURATION_BY_ACTOR,
  SCENE_WAIT_TIMEOUT_MS,
  THINKING_PULSE_INTERVAL_MS,
  STREAM_EVENT_BATCH_MS,
  WORLD_ROLE_TO_ACTOR,
  WORLD_KIND_MAP,
  workflowNodeActorBindings,
  } from '../../lib/world-runtime.js';
import {
  createEmptyContextUsage,
  configureContextTotalTokens,
  loadStoredContextUsage,
  saveStoredContextUsage,
  estimateContextUsageFromConversationDetail,
  mergeContextUsage,
  normalizeContextUsage,
  } from '../../lib/context-usage.js';
import {
  generateHexId,
  getStoredConversationId,
  setStoredConversationId,
  loadStoredWorkspaceState,
  loadLegacyWorkspaceState,
  saveWorkspaceState,
  filterWorkspaceStateByConversationIds,
  legacyWorkspaceMigrationCompleted,
  markLegacyWorkspaceMigrationCompleted,
  normalizeWorkspaceOrdering,
  workspaceStateWithConversationDetail,
  workspaceStateWithTouchedConversation,
  workspaceStateWithConversationRuntimeTask,
  findConversationById,
  findProjectByConversationId,
  buildWorkspaceStateFromConversationDetails,
  conversationDetailToWorkspaceConversation,
  titleFromTaskText,
  isDefaultConversationName,
  normalizeChatImageRefs,
  mergeChatImageRefs,
  createEmptyWorkspaceState,
  createDefaultProject,
  stripChatImageAugmentation,
  chatImageFallbacksByTaskIdFromMessages,
  timestampValue,
  taskUpdatedTimestamp,
  conversationHasActiveTask,
  isTaskActuallyActive,
  projectIdForWorkspacePath,
  removeProjectModeFromWorkspace,
  getWorkspaceConversationIds,
  sleep,
  createConversationWithRetry,
} from '../../lib/workspace-state.js';
import {
  createEmptyWorldTaskState,
  createPendingTaskDraft,
  buildWorldTaskRecord,
  taskSummaryToRuntimeTask,
  taskDetailToRuntimeTask,
  buildAgentLiveSnapshot,
  mergeAgentLiveEntry,
  completeAgentLiveEntries,
  completeLatestAgentLiveEntry,
  runtimeTaskToQuest,
  applyTerminalTaskState,
  isTerminalTaskStatus,
  normalizeTaskStatus,
  sortTaskIdsForRestore,
  taskHasAssistantStreamContent,
  taskFirstStreamTimestamp,
  upsertToolCall,
  getLiveEventStatus,
  legacyLiveEntries,
  } from '../../lib/task-runtime.js';
import {
  buildChatTimeline,
  getChatProgressLine,
  appendChatProgressText,
  appendAnswerDelta,
  eventDeltaText,
  pendingTaskToQuest,
  getToolResponseTraceStatus,
} from '../../lib/chat-timeline.js';
import { clonePointMap, clamp01, roundCoord } from '../../lib/calibration-utils.js';
import {
  normalizeWorldEvent, normalizeWorldEvents, worldEventToRuntimeLog, resolveProviderMeta,
  getWorldEventTag, executorActorForToolGroup, sceneKeyForWorldEvent,
  skillLoadingBubble, skillReadyBubble, summarizeText, toDisplayText,
  WORLD_EVENT_ROUTE_MAP, WORLD_SCENE_EVENT_TYPES, PROVIDER_SCENE_EVENT_TYPES,
  WORKFLOW_SCENE_EVENT_TYPES,
  STREAM_IMMEDIATE_EVENT_TYPES, SCENE_CATCHUP_TOOL_EVENT_TYPES, SCENE_CATCHUP_KEEP_TYPES,
  SCENE_TERMINAL_EVENT_TYPES, CHAT_FINAL_FOLLOWUP_EVENT_TYPES,
} from '../../lib/world-events.js';
import { WorkflowRuntimePage } from '../workflow/WorkflowRuntimePage.jsx';

import { createConversationHandlers } from './hooks/createConversationHandlers.js';
import { createComposerHandlers } from './hooks/createComposerHandlers.js';
import { createSettingsHandlers } from './hooks/createSettingsHandlers.js';
import { createWorldCalibrationHandlers } from './hooks/createWorldCalibrationHandlers.js';
import { createScenePlaybackHelpers } from './hooks/createScenePlaybackHelpers.js';
import { createScenePlayHandlers } from './hooks/createScenePlayHandlers.js';
import { createConversationRuntime } from './hooks/createConversationRuntime.js';
import { createTaskStreamHandlers } from './hooks/createTaskStreamHandlers.js';
import { createDeployHandlers } from './hooks/createDeployHandlers.js';
import { createConversationActivationHandlers } from './hooks/createConversationActivationHandlers.js';
import { createDraftConversationHandlers } from './hooks/createDraftConversationHandlers.js';
import { createWorldRouteHelpers } from './hooks/createWorldRouteHelpers.js';
import { usePerConversationDraft } from './hooks/usePerConversationDraft.js';

const { useState, useEffect, useRef, useMemo } = React;

export function AppShell({ authUser = null, onLogout = () => undefined, initialToast = null }) {
  const [worldTaskState, setWorldTaskState] = useState(() => createEmptyWorldTaskState());
  const [workspaceState, setWorkspaceState] = useState(() => loadStoredWorkspaceState());
  const [activeTab, setActiveTab] = useState('dashboard');
  const [viewMode, setViewMode] = useState('chat');
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('');
  const [viewedWorkflowTask, setViewedWorkflowTask] = useState(null);
  const [conversationPanelCollapsed, setConversationPanelCollapsed] = useState(false);
  const viewModeRef = useRef('chat');
  const viewModeTogglePromiseRef = useRef(null);
  const modeLocationRef = useRef({ chat: null, world: null });
  const [npcStates, setNpcStates] = useState(() => {
    const s = {};
    for (const id of Object.keys(STATIONS)) {
      s[id] = { pos: STATIONS[id], dir: 'front', walking: false };
    }
    return s;
  });
  const [agentLive, setAgentLive] = useState({});
  const [busy, setBusy] = useState(false);
  const [hollow, setHollow] = useState(null);
  const [, setBursts] = useState([]);
  const [now, setNow] = useState(() => new Date());
  const [conversationId, setConversationId] = useState(null);
  const [conversationReady, setConversationReady] = useState(false);
  const [conversationError, setConversationError] = useState('');
  const [, setConversationAttachments] = useState([]);
  const [contextUsage, setContextUsage] = useState(() => createEmptyContextUsage(null));
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

  const stageRef = useRef(null);
  const abortRef = useRef(false);
  const npcStatesRef = useRef(npcStates);
  const dragStateRef = useRef(null);
  const copyTimerRef = useRef(null);
  const [calibrationMode, setCalibrationMode] = useState(false);
  const [settingsSection, setSettingsSection] = useState('llm');
  const [llmSettingsDraft, setLlmSettingsDraft] = useState(() => loadLlmSettingsDraft());
  const [settingsRecordsDraft, setSettingsRecordsDraft] = useState(() => loadSettingsRecordsDraft());
  const [settingsConnectionStatus, setSettingsConnectionStatus] = useState(() => loadSettingsConnectionStatus(settingsRecordsDraft));
  const [settingsSelection, setSettingsSelection] = useState(() => ({
    llm: 'chat',
    llmConfig: 'chat',
    tools: 'tools-mcp',
    memory: 'memory-neo4j',
    knowledge: 'knowledge-qdrant',
    agent: 'agent-default',
    workflow: '',
  }));
  const [skillActionBusy, setSkillActionBusy] = useState('');
  const [, setStationDrafts] = useState(() => clonePointMap(STATIONS));
  const [, setNavDrafts] = useState(() => clonePointMap(NAV_POINTS));
  const [, setMeetDrafts] = useState(() => clonePointMap(MEET_POINTS));
  const [, setCopiedCoords] = useState(false);
  const activeTaskIdRef = useRef(null);
  const activeRunIdRef = useRef(null);
  const conversationIdRef = useRef(null);
  const cancelledRunIdsRef = useRef(new Set());
  const fetchAbortRef = useRef(null);
  const conversationDetailAbortRef = useRef(null);
  const answerBufferRef = useRef('');
  const chatMessageRowsCacheRef = useRef(new WeakMap());
  const chatFinalizedTaskIdsRef = useRef(new Set());
  const userCancelledTaskIdsRef = useRef(new Set());
  const taskImageAttachmentsRef = useRef(new Map());
  const taskRuntimeEventCacheRef = useRef(new Map());
  const pendingPresentationTaskIdsRef = useRef(new Set());
  const previewObjectUrlCacheRef = useRef(new Map());
  const previewMountedRef = useRef(true);
  const scenePlayRef = useRef({});
  const sceneApiRef = useRef({});
  const runtimeApiRef = useRef({});
  const activationApiRef = useRef({});
  const worldRouteApiRef = useRef({});
  const deployApiRef = useRef({});
  const sceneRuntimeRef = useRef({
    pending: [],
    running: false,
    activeItem: null,
    seq: 0,
    currentPromise: null,
    toolCompletionWaiters: new Map(),
    toolCompletions: new Map(),
    thinkingCompletionWaiters: new Map(),
    thinkingCompletions: new Map(),
    thinkingPulseTimers: new Map(),
  });
  const worldTaskStateRef = useRef(worldTaskState);
  const userIdRef = useRef(authUser?.id || '');
  const toastTimerRef = useRef(null);
  const initialToastIdRef = useRef(null);
  const conversationActivationSeqRef = useRef(0);
  // Local draft opened by "new conversation" before the user sends a message.
  // It is intentionally NOT inserted into the sidebar list until first send.
  const draftConversationRef = useRef(null);
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
  // Per-conversation runtime store. Each entry tracks the live state for a
  // single conversation's task run so multiple conversations can stream in
  // parallel without stepping on each other. The displayed React state
  // (`worldTaskState`, `busy`) and the legacy single-instance refs
  // (`activeRunIdRef` etc.) are mirrors of whichever runtime corresponds to
  // the currently-shown conversation. See `getRuntime` / `syncDisplayedRuntime`.
  const runtimesRef = useRef(new Map());
  // While an SSE flush is happening this holds the conversation id that owns
  // the in-flight stream. Setters consult it before falling back to
  // `conversationIdRef.current`, so events from a now-backgrounded conversation
  // still write to *its* runtime (not the one currently shown). Acts as an
  // implicit dynamic context — set on flush enter, cleared on flush exit.
  const streamTargetConvIdRef = useRef(null);
  const worldCalibrationActive = calibrationMode && settingsSection === 'world';

  function syncSettingsConnectionStatus(records) {
    setSettingsConnectionStatus((prev) => {
      const next = sanitizeSettingsConnectionStatus(prev, records);
      persistSettingsConnectionStatus(next, records);
      return next;
    });
  }

  function updateSettingsConnectionStatus(updater, records = settingsRecordsDraft) {
    setSettingsConnectionStatus((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      persistSettingsConnectionStatus(next, records);
      return next;
    });
  }

  useEffect(() => {
    let cancelled = false;
    const workspaceQuery = localWorkspace.path
      ? `?workspace_path=${encodeURIComponent(localWorkspace.path)}`
      : '';
    setAgentLoading(true);
    authFetch(`${API_BASE}/api/agents${workspaceQuery}`, { method: 'GET' }, { json: false })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const contextWindowTokens = configureContextTotalTokens(
          data?.runtime?.context_window_tokens,
        );
        if (contextWindowTokens > 0) {
          setContextUsage((usage) => {
            const next = normalizeContextUsage({
              ...usage,
              totalTokens: contextWindowTokens,
            }, usage?.conversationId || null);
            saveStoredContextUsage(next);
            return next;
          });
        }
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
        const payload = await fetchWorkflowSettingsPayload();
        if (cancelled) return;
        applyWorkflowSettingsPayload(payload);
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

  useEffect(() => {
    if (!calibrationMode || settingsSection !== 'tools') return undefined;
    let cancelled = false;
    authFetch(`${API_BASE}/api/settings/tools`, { method: 'GET' }, { json: false })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (cancelled || !payload) return;
        setSettingsRecordsDraft((prev) => applyToolsSettingsPayloadToRecords(prev, payload));
      })
      .catch((error) => console.warn('failed to fetch tools settings', error));
    return () => { cancelled = true; };
  }, [calibrationMode, settingsSection]);

  useEffect(() => {
    if (!calibrationMode || !['agent', 'workflow'].includes(settingsSection)) return undefined;
    let cancelled = false;
    let retryTimer = null;
    const load = async (attempt = 0) => {
      try {
        const payload = await fetchAgentSettingsPayload();
        if (!cancelled) applyAgentSettingsPayload(payload);
      } catch (error) {
        if (cancelled) return;
        if (attempt < 4) {
          retryTimer = window.setTimeout(() => load(attempt + 1), 400 * (attempt + 1));
          return;
        }
        console.warn('failed to fetch agent settings', error);
        showToast('error', String(error?.message || error));
      }
    };
    load();
    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [calibrationMode, settingsSection]);

  useEffect(() => {
    if (!calibrationMode || settingsSection !== 'workflow') return undefined;
    let cancelled = false;
    let retryTimer = null;
    const load = async (attempt = 0) => {
      try {
        const payload = await fetchWorkflowSettingsPayload();
        if (!cancelled) applyWorkflowSettingsPayload(payload);
      } catch (error) {
        if (cancelled) return;
        if (attempt < 4) {
          retryTimer = window.setTimeout(() => load(attempt + 1), 400 * (attempt + 1));
          return;
        }
        console.warn('failed to fetch workflow settings', error);
        showToast('error', String(error?.message || error));
      }
    };
    load();
    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [calibrationMode, settingsSection]);

  useEffect(() => {
    if (!calibrationMode || settingsSection !== 'llm') return undefined;
    let cancelled = false;
    authFetch(`${API_BASE}/api/settings/llm`, { method: 'GET' }, { json: false })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (cancelled || !payload) return;
        setLlmSettingsDraft((prev) => applyLlmSettingsPayloadToDraft(prev, payload));
      })
      .catch((error) => console.warn('failed to fetch llm settings', error));
    return () => { cancelled = true; };
  }, [calibrationMode, settingsSection]);

  useEffect(() => {
    if (!calibrationMode || !['memory', 'knowledge'].includes(settingsSection)) return undefined;
    let cancelled = false;
    authFetch(`${API_BASE}/api/settings/${settingsSection}`, { method: 'GET' }, { json: false })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (cancelled || !payload) return;
        setSettingsRecordsDraft((prev) => {
          const next = settingsSection === 'memory'
            ? applyMemorySettingsPayloadToRecords(prev, payload)
            : applyKnowledgeSettingsPayloadToRecords(prev, payload);
          syncSettingsConnectionStatus(next);
          return next;
        });
      })
      .catch((error) => console.warn(`failed to fetch ${settingsSection} settings`, error));
    return () => { cancelled = true; };
  }, [calibrationMode, settingsSection]);

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
  const runConfigStorageKey = buildRunConfigStorageKey(authUser, 'chat', conversationId);
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

  useEffect(() => { npcStatesRef.current = npcStates; }, [npcStates]);
  useEffect(() => { worldTaskStateRef.current = worldTaskState; }, [worldTaskState]);
  useEffect(() => { viewModeRef.current = viewMode; }, [viewMode]);
  useEffect(() => { conversationIdRef.current = conversationId; }, [conversationId]);
  useEffect(() => { userIdRef.current = authUser?.id || ''; }, [authUser?.id]);
  useEffect(() => { saveWorkspaceState(workspaceState); }, [workspaceState]);
  useEffect(() => () => {
    previewMountedRef.current = false;
    for (const entry of previewObjectUrlCacheRef.current.values()) {
      if (entry?.url) URL.revokeObjectURL(entry.url);
    }
    previewObjectUrlCacheRef.current.clear();
  }, []);

  function applyHydratedImagePreview(authPreviewUrl, previewUrl) {
    updateWorldTaskState((state) => {
      let changed = false;
      const hydrateTask = (task) => {
        if (!task || !Array.isArray(task.imageAttachments)) return task;
        const imageAttachments = task.imageAttachments.map((ref) => {
          if (ref?.authPreviewUrl !== authPreviewUrl || ref.previewUrl) return ref;
          changed = true;
          return { ...ref, previewUrl };
        });
        return imageAttachments === task.imageAttachments ? task : { ...task, imageAttachments };
      };
      const tasksById = Object.fromEntries(
        Object.entries(state.tasksById || {}).map(([taskId, task]) => [taskId, hydrateTask(task)]),
      );
      const pendingTask = hydrateTask(state.pendingTask);
      return changed ? { ...state, tasksById, pendingTask } : state;
    });
  }

  useEffect(() => {
    const refs = [];
    const collect = (task) => {
      if (!task || !Array.isArray(task.imageAttachments)) return;
      task.imageAttachments.forEach((ref) => {
        if (ref?.authPreviewUrl && !ref.previewUrl) refs.push(ref.authPreviewUrl);
      });
    };
    Object.values(worldTaskState.tasksById || {}).forEach(collect);
    collect(worldTaskState.pendingTask);

    refs.forEach((authPreviewUrl) => {
      const cached = previewObjectUrlCacheRef.current.get(authPreviewUrl);
      if (cached?.status === 'ready' && cached.url) {
        applyHydratedImagePreview(authPreviewUrl, cached.url);
        return;
      }
      if (cached?.status === 'loading') return;
      previewObjectUrlCacheRef.current.set(authPreviewUrl, { status: 'loading', url: '' });
      authFetch(authPreviewUrl, { method: 'GET' }, { json: false })
        .then((response) => {
          if (!response.ok) throw new Error(`image preview failed: ${response.status}`);
          return response.blob();
        })
        .then((blob) => {
          const objectUrl = URL.createObjectURL(blob);
          previewObjectUrlCacheRef.current.set(authPreviewUrl, { status: 'ready', url: objectUrl });
          if (!previewMountedRef.current) {
            URL.revokeObjectURL(objectUrl);
            return;
          }
          applyHydratedImagePreview(authPreviewUrl, objectUrl);
        })
        .catch((error) => {
          previewObjectUrlCacheRef.current.delete(authPreviewUrl);
          console.warn('image preview fetch failed', error);
        });
    });
  }, [worldTaskState]);

  const {
    invalidateConversationActivation,
    isConversationActivationCurrent,
    isDraftConversationId,
    clearDraftConversationState,
    openDraftConversation,
    ensureServerConversationForActiveDraft,
    materializeDraftConversationForSend,
    fetchTaskRuntimeDetail,
    restoreLatestTaskRuntime,
    restoreConversationTaskRuntimes,
    cancelActiveTask,
    queueTaskInput,
    cancelActiveConversationTask,
    stopConversationRuntimeBeforeDelete,
    updateConversationTitle,
  } = createDraftConversationHandlers({
    API_BASE,
    DEFAULT_PROJECT_ID,
    DEFAULT_SESSION_NAME,
    // Late-bound: activation / runtime factories below.
    applyConversationSnapshot: (...args) => activationApiRef.current.applyConversationSnapshot?.(...args),
    authFetch,
    buildAgentLiveSnapshot,
    buildApiHeaders,
    chatFinalizedTaskIdsRef,
    conversationActivationSeqRef,
    conversationDetailAbortRef,
    conversationId,
    conversationIdRef,
    createConversationInProject: (...args) => createConversationInProject(...args),
    createDefaultProject,
    createEmptyContextUsage,
    createEmptyWorldTaskState,
    detachActiveRunFromCurrentConversation: (...args) => activationApiRef.current.detachActiveRunFromCurrentConversation?.(...args),
    draftConversationRef,
    flushRuntimeTasksToWorkspace: (...args) => runtimeApiRef.current.flushRuntimeTasksToWorkspace?.(...args),
    generateHexId,
    getRuntime: (...args) => runtimeApiRef.current.getRuntime?.(...args),
    isDefaultConversationName,
    isTaskActuallyActive,
    mutateRuntime: (...args) => runtimeApiRef.current.mutateRuntime?.(...args),
    normalizeWorkspaceOrdering,
    normalizeWorldEvents,
    pendingCreatedDetailRef,
    rekeyChatDraft,
    runtimesRef,
    setAgentLive,
    setComposerAttachment,
    setContextUsage,
    setConversationAttachments,
    setConversationError,
    setConversationId,
    setConversationReady,
    setLocalWorkspace,
    setStoredConversationId,
    setUploadState,
    setWorkspaceState,
    taskDetailToRuntimeTask,
    taskRuntimeEventCacheRef,
    taskUpdatedTimestamp,
    titleFromTaskText,
    updateWorldTaskState: (...args) => runtimeApiRef.current.updateWorldTaskState?.(...args),
    userCancelledTaskIdsRef,
    userIdRef,
    viewModeRef,
    workspaceState,
    workspaceStateWithConversationDetail,
  });


  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
  }, []);

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  useEffect(() => {
    if (!initialToast || initialToastIdRef.current === initialToast.id) return;
    initialToastIdRef.current = initialToast.id;
    showToast(initialToast.kind, initialToast.message);
  }, [initialToast]);

  useEffect(() => {
    let cancelled = false;
    const bootstrapActivationSeq = conversationActivationSeqRef.current;
    (async () => {
      try {
        const storedConversationIds = getWorkspaceConversationIds(workspaceState);
        let details = [];
        let serverListLoaded = false;
        try {
          const listResponse = await authFetch(`${API_BASE}/api/conversations`, { method: 'GET' }, { json: false });
          if (!listResponse.ok) throw new Error(`conversation list failed: ${listResponse.status}`);
          const listed = await listResponse.json();
          details = Array.isArray(listed) ? listed : [];
          serverListLoaded = true;
        } catch (error) {
          console.warn('conversation list restore failed; falling back to local cache:', error);
        }
        if (!serverListLoaded && storedConversationIds.length > 0) {
          const restoredDetails = await Promise.all(
            storedConversationIds.map((nextConversationId) => (
              fetchConversationDetail(nextConversationId).catch((error) => {
                console.warn('conversation restore skipped:', error);
                return null;
              })
            ))
          );
          details = restoredDetails.filter(Boolean);
        }
        if (details.length === 0) {
          if (!isConversationActivationCurrent(bootstrapActivationSeq)) return;
          const created = await createConversationWithRetry(
            { title: DEFAULT_SESSION_NAME, execution_mode: 'chat' },
            () => isConversationActivationCurrent(bootstrapActivationSeq),
          );
          if (!created) return;
          details = [created];
        }
        if (cancelled || !isConversationActivationCurrent(bootstrapActivationSeq)) return;
        const storedConversationId = getStoredConversationId();
        let previousWorkspaceState = storedConversationIds.length > 0
          ? {
            ...workspaceState,
            activeConversationId: storedConversationId || workspaceState.activeConversationId,
          }
          : createEmptyWorkspaceState();
        if (serverListLoaded && !legacyWorkspaceMigrationCompleted()) {
          const serverConversationIds = details.map((detail) => detail.conversation_id).filter(Boolean);
          const migratedLegacyState = filterWorkspaceStateByConversationIds(
            loadLegacyWorkspaceState(),
            serverConversationIds,
          );
          if (migratedLegacyState) previousWorkspaceState = migratedLegacyState;
        }
        const nextWorkspaceState = buildWorkspaceStateFromConversationDetails(details, previousWorkspaceState);
        saveWorkspaceState(nextWorkspaceState);
        if (serverListLoaded) markLegacyWorkspaceMigrationCompleted();
        setWorkspaceState(nextWorkspaceState);
        const activeSummary = details.find((detail) => detail.conversation_id === nextWorkspaceState.activeConversationId) || details[0];
        if (activeSummary) {
          const activeDetail = Array.isArray(activeSummary.messages)
            ? activeSummary
            : await fetchConversationDetail(activeSummary.conversation_id);
          await activateConversationDetail(activeDetail);
        }
        setConversationReady(true);
      } catch (error) {
        if (cancelled) return;
        setConversationError(String(error?.message || error));
      }
    })();
    return () => {
      cancelled = true;
      fetchAbortRef.current?.abort?.();
      conversationDetailAbortRef.current?.abort?.();
    };
  }, []);

  useEffect(() => {
    if (!conversationError) return;
    setHollow({
      title: 'Conversation Bootstrap Error',
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
    updateWorldTaskState,
    showToast,
  } = createConversationRuntime({
    activeRunIdRef,
    activeTaskIdRef,
    answerBufferRef,
    cancelledRunIdsRef,
    conversationIdRef,
    createEmptyWorldTaskState,
    fetchAbortRef,
    normalizeWorkspaceOrdering,
    runtimesRef,
    setBusy,
    setToast,
    setWorkspaceState,
    setWorldTaskState,
    streamTargetConvIdRef,
    taskImageAttachmentsRef,
    toastTimerRef,
    worldTaskStateRef,
  });

  runtimeApiRef.current = {
    getRuntime,
    mutateRuntime,
    flushRuntimeTasksToWorkspace,
    updateWorldTaskState,
  };



  const {
    applyConversationSnapshot,
    detachActiveRunFromCurrentConversation,
    activateConversationShell,
    activateConversationDetail,
    fetchConversationDetail,
    ensureTaskForEvent,
    updateTaskById,
    getTaskById,
  } = createConversationActivationHandlers({
    API_BASE,
    activeRuntimeTargetConvId,
    activeTaskIdRef,
    authFetch,
    buildWorldTaskRecord,
    chatImageFallbacksByTaskIdFromMessages,
    clearDraftConversationState,
    conversationIdRef,
    draftConversationRef,
    // Late-bound: created by createScenePlaybackHelpers further below.
    dropPendingSceneItems: (...args) => sceneApiRef.current.dropPendingSceneItems?.(...args),
    estimateContextUsageFromConversationDetail,
    findConversationById,
    findProjectByConversationId,
    flushRuntimeTasksToWorkspace,
    getRuntime,
    invalidateConversationActivation,
    isConversationActivationCurrent,
    isTaskActuallyActive,
    isTerminalTaskStatus,
    loadStoredContextUsage,
    mergeChatImageRefs,
    mergeContextUsage,
    mutateRuntime,
    normalizeWorkspaceOrdering,
    pendingCreatedDetailRef,
    // Late-bound: created by createScenePlaybackHelpers further below.
    resetSceneActors: (...args) => sceneApiRef.current.resetSceneActors?.(...args),
    restoreConversationTaskRuntimes,
    saveStoredContextUsage,
    setAgentLive,
    setComposerAttachment,
    setContextUsage,
    setConversationAttachments,
    setConversationId,
    setLocalWorkspace,
    setStoredConversationId,
    setUploadState,
    setViewMode,
    setWorkspaceState,
    sortTaskIdsForRestore,
    syncDisplayedRuntime,
    taskImageAttachmentsRef,
    taskSummaryToRuntimeTask,
    timestampValue,
    updateWorldTaskState,
    userCancelledTaskIdsRef,
    userIdRef,
    viewModeRef,
    workspaceState,
    workspaceStateWithConversationDetail,
    worldTaskStateRef,
  });

  activationApiRef.current = {
    applyConversationSnapshot,
    detachActiveRunFromCurrentConversation,
    activateConversationShell,
    activateConversationDetail,
    fetchConversationDetail,
    ensureTaskForEvent,
    updateTaskById,
    getTaskById,
  };



  const {
    pushBurst,
    updateNpc,
    dirFromTo,
    walkDirFor,
    getProviderToToolManagerRoute,
    getToolManagerToProviderRoute,
    getExecutorReportRoute,
    getActorReturnMeta,
    pauseForHandoff,
    getProviderToolRequestAction,
  } = createWorldRouteHelpers({
    MAP_H,
    MAP_W,
    npcStatesRef,
    // Late-bound: created by createWorldCalibrationHandlers below.
    orientToward: (...args) => worldRouteApiRef.current.orientToward?.(...args),
    setBursts,
    setNpcStates,
    sleep,
  });

  // World/calibration helpers first so scene playback can close over real bindings
  // (not TDZ placeholders). sleep stays the module import — do NOT redeclare it.
  const {
    resolvePathSpec,
    orientToward,
    clearAllPoseDebug,
    setPointPosition,
    stagePointFromClient,
  } = createWorldCalibrationHandlers({
    MEET_POINTS,
    NAV_POINTS,
    ROUTES,
    STATIONS,
    clamp01,
    dirFromTo,
    npcStatesRef,
    roundCoord,
    setMeetDrafts,
    setNavDrafts,
    setNpcStates,
    setStationDrafts,
    stageRef,
    updateNpc,
  });

  worldRouteApiRef.current = {
    orientToward,
  };

  const {
    distancePx,
    appendTaskEvent,
    dropPendingSceneItems,
    waitForSceneCompletion,
    compactPendingSceneItems,
    markAgentLive,
    startThinkingPulse,
    setActorIdle,
    setActorActive,
    returnActorHome,
    resetSceneActors,
    completeTaskAgents,
    finalizeTaskPresentation,
    isChatOriginTask,
    isBotWorkflowTask,
    scheduleSceneEvent,
  } = createScenePlaybackHelpers({
    MAP_H,
    MAP_W,
    PROVIDER_SCENE_EVENT_TYPES,
    SCENE_CATCHUP_KEEP_TYPES,
    SCENE_CATCHUP_TOOL_EVENT_TYPES,
    SCENE_TERMINAL_EVENT_TYPES,
    SCENE_WAIT_TIMEOUT_MS,
    STATIONS,
    THINKING_PULSE_INTERVAL_MS,
    WORLD_EVENT_ROUTE_MAP,
    WORLD_KIND_MAP,
    WORLD_ROLE_TO_ACTOR,
    animateWalk: (...args) => scenePlayRef.current.animateWalk?.(...args),
    completeAgentLiveEntries,
    executorActorForToolGroup,
    getTaskById,
    legacyLiveEntries,
    mergeAgentLiveEntry,
    normalizeTaskStatus,
    pendingPresentationTaskIdsRef,
    playWorldEventScene: (...args) => scenePlayRef.current.playWorldEventScene?.(...args),
    resolvePathSpec,
    resolveProviderMeta,
    sceneKeyForWorldEvent,
    sceneRuntimeRef,
    setAgentLive,
    setRuntimeActiveTaskId,
    setRuntimeBusy,
    setRuntimeFetchController,
    summarizeText,
    updateNpc,
    updateTaskById,
    updateWorldTaskState,
    worldEventToRuntimeLog,
  });
  sceneApiRef.current = {
    dropPendingSceneItems,
    resetSceneActors,
  };

  useEffect(() => {
    function handlePointerMove(e) {
      const drag = dragStateRef.current;
      if (!drag || !worldCalibrationActive || busy) return;
      const point = stagePointFromClient(e.clientX, e.clientY);
      if (!point) return;
      const footX = point.x * MAP_W - drag.offsetX;
      const footY = point.y * MAP_H - drag.offsetY;
      setPointPosition(drag.target, drag.id, { x: footX / MAP_W, y: footY / MAP_H });
    }
    const stopDrag = () => { dragStateRef.current = null; };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDrag);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopDrag);
    };
  }, [busy, worldCalibrationActive]);

  const {
    handleToggleCalibration,
    handleSaveSettingsDraft,
    handleSaveToolsSettingsDraft,
    handleDeleteLlmProvider,
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
    handleInstallSkillDirectory,
    handleToggleSkill,
    handleUninstallSkill,
  } = createSettingsHandlers({
    API_BASE,
    LLM_SETTINGS_STORAGE_KEY,
    SETTINGS_RECORDS_STORAGE_KEY,
    WEB_SEARCH_PROVIDER_OPTIONS,
    activeTab,
    agentCatalogFromSettings,
    agentSettingsDraft,
    applyKnowledgeSettingsPayloadToRecords,
    applyLlmSettingsPayloadToDraft,
    applyMemorySettingsPayloadToRecords,
    applyToolsSettingsPayloadToRecords,
    authFetch,
    buildKnowledgeSettingsPayload,
    buildMemorySettingsPayload,
    buildToolsSettingsPayload,
    busy,
    clearAllPoseDebug,
    createDefaultCustomAgentPayload,
    createDefaultCustomWorkflowPayload,
    dragStateRef,
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
    setCalibrationMode,
    setCopiedCoords,
    setLlmSettingsDraft,
    setSettingsRecordsDraft,
    setSettingsSection,
    setSkillActionBusy,
    setWorkflowSettingsDraft,
    settingsConnectionSignatureFor,
    settingsRecordsDraft,
    showToast,
    syncSettingsConnectionStatus,
    updateSettingsConnectionStatus,
    withAlwaysAllowedAgentTools,
    workflowById,
    workflowSettingsDraft,
  });
  const {
    animateWalk,
    runStep,
    playWorkflowEventScene,
    playWorldEventScene,
  } = createScenePlayHandlers({
    DEFAULT_WALK_MIN_DURATION_MS,
    DEFAULT_WALK_SPEED_PX_PER_SEC,
    KIND_COLORS,
    PROVIDER_SCENE_EVENT_TYPES,
    STATIONS,
    WALK_MIN_DURATION_BY_ACTOR,
    WALK_SPEED_BY_ACTOR,
    WORLD_EVENT_ROUTE_MAP,
    WORLD_KIND_MAP,
    WORLD_ROLE_TO_ACTOR,
    WORKFLOW_SCENE_EVENT_TYPES,
    answerBufferRef,
    completeLatestAgentLiveEntry,
    conversationIdRef,
    distancePx,
    executorActorForToolGroup,
    finalizeTaskPresentation,
    getActorReturnMeta,
    getExecutorReportRoute,
    getLiveEventStatus,
    getProviderToToolManagerRoute,
    getProviderToolRequestAction,
    getTaskById,
    getToolManagerToProviderRoute,
    getWorldEventTag,
    markAgentLive,
    npcStatesRef,
    orientToward,
    pauseForHandoff,
    pushBurst,
    resolvePathSpec,
    resolveProviderMeta,
    returnActorHome,
    sceneKeyForWorldEvent,
    setActorActive,
    setActorIdle,
    setAgentLive,
    setHollow,
    skillLoadingBubble,
    skillReadyBubble,
    sleep,
    startThinkingPulse,
    summarizeText,
    updateNpc,
    updateTaskById,
    waitForSceneCompletion,
    walkDirFor,
    workflowNodeActorBindings,
  });
  scenePlayRef.current = {
    animateWalk,
    runStep,
    playWorkflowEventScene,
    playWorldEventScene,
  };



  const {
    uploadAttachment,
    uploadChatImage,
    handleAttachmentSelect,
    handleAttachmentClear,
  } = createComposerHandlers({
    API_BASE,
    abortRef,
    applyConversationSnapshot,
    authFetch,
    conversationId,
    conversationIdRef,
    draftConversationRef,
    ensureServerConversationForActiveDraft,
    getRuntime,
    isDraftConversationId,
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
  } = createTaskStreamHandlers({
    API_BASE,
    CHAT_FINAL_FOLLOWUP_EVENT_TYPES,
    STREAM_EVENT_BATCH_MS,
    STREAM_IMMEDIATE_EVENT_TYPES,
    WORKFLOW_SCENE_EVENT_TYPES,
    WORLD_SCENE_EVENT_TYPES,
    activeRuntimeTargetConvId,
    appendAnswerDelta,
    appendChatProgressText,
    appendTaskEvent,
    applyConversationSnapshot,
    batchRuntimeMutations,
    applyTerminalTaskState,
    authFetch,
    buildApiHeaders,
    chatFinalizedTaskIdsRef,
    compactPendingSceneItems,
    completeTaskAgents,
    conversationId,
    conversationIdRef,
    dropPendingSceneItems,
    ensureTaskForEvent,
    eventDeltaText,
    flushRuntimeTasksToWorkspace,
    generateHexId,
    getChatProgressLine,
    getRuntime,
    getTaskById,
    getToolResponseTraceStatus,
    isBotWorkflowTask,
    isChatOriginTask,
    isTerminalTaskStatus,
    mergeChatImageRefs,
    mutateRuntime,
    normalizeChatImageRefs,
    normalizeContextUsage,
    normalizeTaskStatus,
    normalizeWorldEvent,
    pendingPresentationTaskIdsRef,
    readRuntimeAnswerBuffer,
    // Late-bound: defined by createDeployHandlers later in the render body.
    removeConversationTaskFromWorkspace: (...args) => deployApiRef.current.removeConversationTaskFromWorkspace?.(...args),
    resetSceneActors,
    resolveProviderMeta,
    saveStoredContextUsage,
    scheduleSceneEvent,
    setComposerAttachment,
    setContextUsage,
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
    updateWorldTaskState,
    uploadAttachment,
    upsertToolCall,
    userCancelledTaskIdsRef,
    userIdRef,
  });


  const {
    handleSelectConversation,
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
    handleRemoveProject,
    handleToggleViewMode,
    handleOpenTaskReport,
    handleRetryTask,
  } = createConversationHandlers({
    API_BASE,
    DEFAULT_PROJECT_ID,
    DEFAULT_SESSION_NAME,
    activateConversationDetail,
    activateConversationShell,
    applyConversationSnapshot,
    authFetch,
    buildApiHeaders,
    // Late-bound: createDeployHandlers runs after this factory (selection pending deps).
    buildDeployRequest: (...args) => deployApiRef.current.buildDeployRequest?.(...args),
    calibrationMode,
    canStartDeployForConversation: (...args) => deployApiRef.current.canStartDeployForConversation?.(...args),
    clearAllPoseDebug,
    clearDraftConversationState,
    conversationDetailAbortRef,
    conversationId,
    conversationIdRef,
    createDefaultProject,
    draftConversationRef,
    dragStateRef,
    fetchConversationDetail,
    findConversationById,
    findProjectByConversationId,
    invalidateConversationActivation,
    isConversationActivationCurrent,
    modeLocationRef,
    normalizeWorkspaceOrdering,
    openDraftConversation,
    projectIdForWorkspacePath,
    removeProjectModeFromWorkspace,
    setActiveTab,
    setCalibrationMode,
    setCopiedCoords,
    setHollow,
    setViewMode,
    setWorkspaceState,
    showToast,
    startDeploy: (...args) => deployApiRef.current.startDeploy?.(...args),
    stopConversationRuntimeBeforeDelete,
    viewModeRef,
    viewModeTogglePromiseRef,
    workspaceState,
    workspaceStateWithConversationDetail,
  });
  const quests = useMemo(() => {
    const confirmedTasks = worldTaskState.taskOrder
      .map((taskId) => worldTaskState.tasksById[taskId])
      .filter(Boolean)
      .map(runtimeTaskToQuest);
    return worldTaskState.pendingTask
      ? [...confirmedTasks, pendingTaskToQuest(worldTaskState.pendingTask)]
      : confirmedTasks;
  }, [worldTaskState]);
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
    APP_DEFAULT_AGENT_OPTIONS,
    abortRef,
    activeRunIdRef,
    activeTaskIdRef,
    answerBufferRef,
    applyTerminalTaskState,
    busy,
    cancelActiveConversationTask,
    cancelActiveTask,
    queueTaskInput,
    chatFinalizedTaskIdsRef,
    completeTaskAgents,
    conversationDetailToWorkspaceConversation,
    conversationError,
    conversationId,
    conversationIdRef,
    conversationReady,
    conversationSelectionPending,
    createEmptyWorldTaskState,
    createPendingTaskDraft,
    defaultAgentId,
    defaultWorkflowId,
    draftConversationRef,
    dropPendingSceneItems,
    executeQuest,
    fetchAbortRef,
    findConversationById,
    flushRuntimeTasksToWorkspace,
    getRuntime,
    isDefaultConversationName,
    isTaskActuallyActive,
    materializeDraftConversationForSend,
    mutateRuntime,
    normalizeWorkflowSettings,
    normalizeWorkspaceOrdering,
    pendingCreatedDetailRef,
    queuedDeploy,
    readRuntimeAnswerBuffer,
    resetSceneActors,
    selectedConversationId,
    setBusy,
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
    updateWorldTaskState,
    userCancelledTaskIdsRef,
    viewMode,
    viewModeRef,
    workflowSettingsDraft,
    workspaceState,
    workspaceStateWithConversationDetail,
    workspaceStateWithTouchedConversation,
    worldTaskStateRef,
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
    const wasActive = runtime?.activeTaskId === taskId
      || runtime?.worldTaskState?.activeTaskId === taskId
      || (runtime?.worldTaskState?.pendingTask?.taskId || runtime?.worldTaskState?.pendingTask?.id) === taskId;
    updateWorldTaskState((state) => {
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
    if (targetConversationId === conversationIdRef.current) setAgentLive({});
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
              tasks: quests,
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
      .filter((project) => !project.hiddenModes?.includes(visibleConversationMode))
      .map((project) => ({
        ...project,
        conversations: project.conversations.filter(
          (conversation) => conversation.executionMode === visibleConversationMode,
        ),
      })),
  }), [panelWorkspaceState, conversationId, visibleConversationMode]);
  // True when the currently-viewed conversation has at least one task in
  // `running` / `queued` state. Drives both the composer disabled state and
  // the polling loop below — so a running task in this conversation always
  // blocks input and keeps the UI in sync, regardless of whether THIS client
  // is the one who started the run (the previous logic only ever consulted
  // local `busy`, which is false after a tab-switch round-trip).
  const currentConversationActive = useMemo(() => {
    if (!conversationId) return false;
    for (const project of panelWorkspaceState.projects) {
      const conversation = project.conversations.find((item) => item.id === conversationId);
      if (conversation) return conversationHasActiveTask(conversation);
    }
    return false;
  }, [panelWorkspaceState, conversationId]);
  const currentConversationRunning = busy
    || currentConversationActive
    || Boolean(conversationId && getRuntime(conversationId)?.fetchController);
  useEffect(() => {
    if (!queuedDeploy) return;
    if (!canStartDeployForConversation(queuedDeploy.targetConversationId)) return;
    if (currentConversationRunning || uploadState.active || calibrationMode) return;
    const request = queuedDeploy;
    // Draft first-send path: materialize server conversation before streaming.
    if (draftConversationRef.current) {
      setQueuedDeploy(null);
      materializeDraftConversationForSend(request)
        .then((materialized) => {
          const realConversationId = materialized?.id || null;
          if (!realConversationId) return;
          request.targetConversationId = realConversationId;
          request.runtimeConversationId = realConversationId;
          if (!canStartDeployForConversation(realConversationId)) {
            setQueuedDeploy(request);
            return;
          }
          startDeploy(request, realConversationId, materialized?.detail || null);
        })
        .catch((error) => {
          console.error('draft conversation create failed', error);
          failPendingDeploy(request, error);
          showToast('error', String(error?.message || error));
        });
      return;
    }
    const deployConvId = request.targetConversationId || conversationIdRef.current || conversationId;
    if (!deployConvId || String(deployConvId).startsWith('draft-')) return;
    setQueuedDeploy(null);
    startDeploy(request, deployConvId);
  }, [
    queuedDeploy,
    conversationReady,
    conversationSelectionPending,
    conversationError,
    currentConversationRunning,
    uploadState.active,
    calibrationMode,
    conversationId,
  ]);
  // If there's a running/queued task in the currently-viewed conversation,
  // expose its taskId so the polling effect below can refresh it. We pick
  // the *latest* running task by updatedAt — in practice there's only ever
  // one, but be defensive in case the backend ever pipelines.
  const activeTaskIdForPolling = useMemo(() => {
    if (!currentConversationActive) return null;
    for (const project of panelWorkspaceState.projects) {
      const conversation = project.conversations.find((item) => item.id === conversationId);
      if (!conversation) continue;
      const tasks = Array.isArray(conversation.tasks) ? conversation.tasks : [];
      const candidates = tasks
        .filter((task) => isTaskActuallyActive(task))
        .sort((a, b) => taskUpdatedTimestamp(b) - taskUpdatedTimestamp(a));
      const top = candidates[0];
      return top?.taskId || top?.id || null;
    }
    return null;
  }, [currentConversationActive, panelWorkspaceState, conversationId]);
  const backgroundTaskPollTargets = useMemo(() => {
    const targets = [];
    const seen = new Set();
    for (const project of panelWorkspaceState.projects || []) {
      for (const conversation of project.conversations || []) {
        if (!conversation?.id || conversation.id === conversationId) continue;
        const tasks = Array.isArray(conversation.tasks) ? conversation.tasks : [];
        for (const task of tasks) {
          if (!isTaskActuallyActive(task)) continue;
          const taskId = task.taskId || task.id;
          if (!taskId) continue;
          const key = `${conversation.id}:${taskId}`;
          if (seen.has(key)) continue;
          seen.add(key);
          targets.push({
            conversationId: conversation.id,
            taskId,
          });
        }
      }
    }
    return targets.sort((a, b) => `${a.conversationId}:${a.taskId}`.localeCompare(`${b.conversationId}:${b.taskId}`));
  }, [panelWorkspaceState, conversationId]);
  const backgroundTaskPollKey = useMemo(
    () => backgroundTaskPollTargets.map((target) => `${target.conversationId}:${target.taskId}`).join('|'),
    [backgroundTaskPollTargets],
  );
  // Polling loop: when the active conversation has a running task that THIS
  // client did not start, GET /api/tasks/{id} every 2s so the chat timeline
  // and task progress catch up. Bails as soon as the task transitions to a
  // terminal state — currentConversationActive flips false, the effect
  // re-runs with `activeTaskIdForPolling === null`, and we stop polling.
  // We deliberately skip this loop when activeRunIdRef.current is set, because
  // that means the per-message stream is already feeding live events from
  // this client; polling on top would double-process the same events.
  useEffect(() => {
    if (!activeTaskIdForPolling) return undefined;
    if (activeRunIdRef.current) return undefined;
    let cancelled = false;
    const targetConversationId = conversationId;
    const isCurrentPoll = () => (
      !cancelled && conversationIdRef.current === targetConversationId
    );
    const tick = () => {
      if (cancelled) return;
      restoreLatestTaskRuntime(activeTaskIdForPolling, {
        targetConversationId,
        isCurrentActivation: isCurrentPoll,
      }).catch((error) => {
        if (error?.status === 404) {
          removeMissingTask(targetConversationId, activeTaskIdForPolling);
          return;
        }
        console.warn('task poll failed', error);
      });
    };
    // Fire once immediately so the user sees fresh state on switch-back
    // without waiting for the first 2s interval.
    tick();
    const timer = setInterval(tick, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTaskIdForPolling, conversationId]);
  useEffect(() => {
    if (!backgroundTaskPollKey) return undefined;
    let cancelled = false;
    const targets = backgroundTaskPollTargets;
    const tick = () => {
      if (cancelled) return;
      targets.forEach(({ conversationId: targetConversationId, taskId }) => {
        fetchTaskRuntimeDetail(taskId)
          .then((detail) => {
            if (cancelled || !detail) return;
            setWorkspaceState((state) => {
              const conversation = findConversationById(state, targetConversationId);
              const previousTask = (conversation?.tasks || []).find((task) => (task.taskId || task.id) === taskId) || null;
              const nextTask = taskDetailToRuntimeTask(detail.normalizedTask, previousTask, userIdRef.current);
              return workspaceStateWithConversationRuntimeTask(state, targetConversationId, nextTask);
            });
          })
          .catch((error) => {
            if (error?.status === 404) {
              removeMissingTask(targetConversationId, taskId);
              return;
            }
            if (!cancelled) console.warn('background task poll failed', error);
          });
      });
    };
    tick();
    const timer = setInterval(tick, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backgroundTaskPollKey]);
  const runtimeCurrentTask = useMemo(() => {
    if (worldTaskState.activeTaskId && worldTaskState.tasksById[worldTaskState.activeTaskId]) {
      return worldTaskState.tasksById[worldTaskState.activeTaskId];
    }
    if (worldTaskState.pendingTask) {
      return null;
    }
    const latestTaskId = worldTaskState.taskOrder[worldTaskState.taskOrder.length - 1];
    return latestTaskId ? worldTaskState.tasksById[latestTaskId] || null : null;
  }, [worldTaskState]);
  const currentTask = useMemo(() => {
    if (viewMode !== 'chat' && viewedWorkflowTask?.conversationId === conversationId) {
      const viewedTask = worldTaskState.tasksById[viewedWorkflowTask.taskId];
      if (viewedTask) return viewedTask;
    }
    return runtimeCurrentTask;
  }, [conversationId, runtimeCurrentTask, viewedWorkflowTask, viewMode, worldTaskState.tasksById]);
  const worldWorkflow = useMemo(() => {
    const selected = workflowById(workflowSettingsDraft, selectedWorkflowId || defaultWorkflowId);
    return currentTask?.executionMode === 'bot' && currentTask.workflowSnapshot
      ? currentTask.workflowSnapshot
      : selected;
  }, [currentTask, defaultWorkflowId, selectedWorkflowId, workflowSettingsDraft]);
  const currentWorkflowTask = currentTask?.executionMode === 'bot' ? currentTask : null;
  async function handleSelectWorkflowTask(projectId, targetConversationId, task) {
    const taskId = task?.taskId || task?.task_id || task?.id;
    if (!targetConversationId || !taskId) return;
    setViewedWorkflowTask({ conversationId: targetConversationId, taskId });
    await handleSelectConversation(projectId, targetConversationId);
    try {
      await restoreLatestTaskRuntime(taskId, {
        targetConversationId,
        isCurrentActivation: () => conversationIdRef.current === targetConversationId,
      });
    } catch (error) {
      if (error?.status !== 404) throw error;
      removeMissingTask(targetConversationId, taskId);
      showToast('error', 'Task no longer exists. Removed the stale entry.');
      return;
    }
  }
  async function handleDeleteWorkflowTask(_projectId, targetConversationId, task) {
    const taskId = task?.taskId || task?.task_id || task?.id;
    if (!targetConversationId || !taskId) return;
    if (viewedWorkflowTask?.conversationId === targetConversationId && viewedWorkflowTask.taskId === taskId) {
      setViewedWorkflowTask(null);
    }
    const response = await authFetch(`${API_BASE}/api/tasks/${encodeURIComponent(taskId)}`, {
      method: 'DELETE',
    });
    if (!response.ok && response.status !== 404) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.detail || `task delete failed: ${response.status}`);
    }
    updateWorldTaskState((state) => {
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
    pendingPresentationTaskIdsRef.current.delete(taskId);
  }
  useEffect(() => {
    const activeTaskId = worldTaskState.activeTaskId || activeTaskIdRef.current;
    if (!activeTaskId || !runtimeCurrentTask) return;
    if (isTaskActuallyActive(runtimeCurrentTask)) return;
    if (!busy && !currentConversationActive) return;
    // This sanity reset only ever applies to the conversation currently shown
    // — `worldTaskState` is the mirror of the displayed runtime.
    setRuntimeBusy(false);
    setRuntimeActiveTaskId(null);
    setRuntimeFetchController(null);
    updateWorldTaskState((state) => (
      state.activeTaskId === activeTaskId
        ? { ...state, activeTaskId: null }
        : state
    ));
  }, [busy, currentConversationActive, runtimeCurrentTask, worldTaskState.activeTaskId]);
  useEffect(() => {
    if (!busy || currentConversationActive) return;
    const activeTaskId = worldTaskState.activeTaskId || activeTaskIdRef.current;
    if (activeTaskId) return;
    if (worldTaskState.pendingTask && isTaskActuallyActive(worldTaskState.pendingTask)) return;
    // Stale local runtime guard: if no task is actually active in the current
    // conversation, a leftover `busy` flag should not keep the composer locked.
    setRuntimeBusy(false);
    setRuntimeFetchController(null);
    setRuntimeActiveTaskId(null);
  }, [busy, currentConversationActive, worldTaskState.activeTaskId, worldTaskState.pendingTask]);
  const activeTaskText = useMemo(() => {
    const activeTaskId = worldTaskState.activeTaskId || activeTaskIdRef.current;
    if (activeTaskId && worldTaskState.tasksById[activeTaskId]?.title) {
      return worldTaskState.tasksById[activeTaskId].title;
    }
    if (worldTaskState.pendingTask?.title) {
      return worldTaskState.pendingTask.title;
    }
    return '';
  }, [worldTaskState]);
  const chatMessages = useMemo(() => {
    const rows = [];
    const orderedTasks = worldTaskState.taskOrder
      .map((taskId) => worldTaskState.tasksById[taskId])
      .filter(Boolean);
    const rowCache = chatMessageRowsCacheRef.current;
    for (const task of orderedTasks) {
      const cachedRows = rowCache.get(task);
      if (cachedRows) {
        rows.push(...cachedRows);
        continue;
      }
      const taskRows = [];
      const taskId = task.taskId || task.id || task.title;
      const status = normalizeTaskStatus(task.status);
      const answer = String(task.answerText || '').trim();
      const progress = String(task.chatStreamText || '').trim();
      const error = String(task.error || '').trim();
      // User-cancelled turns with no agent-visible content are rolled back
      // entirely (composer restore). Ignore early chatStreamText receipts such as
      // "Task received." — those are not agent visualization and must not keep
      // empty You / Assistant shells after Stop.
      if (
        status === 'cancelled'
        && !error
        && !answer
        && !taskHasAssistantStreamContent(task)
      ) {
        continue;
      }
      // Cancelled tasks that already streamed content stay in history so the
      // partial answer / trace remains visible.
      if (task.title) {
        taskRows.push({
          id: `${taskId}-user`,
          role: 'user',
          text: stripInjectedSkillInstruction(task.title),
          status,
          createdAt: task.createdAt,
          completedAt: task.completedAt,
          images: Array.isArray(task.imageAttachments) ? task.imageAttachments : [],
        });
      }
      if (answer || progress || error || status === 'running' || status === 'queued' || status === 'failed' || status === 'cancelled') {
        const progressLines = progress
          ? progress.split('\n').map((line) => line.trim()).filter(Boolean)
          : [];
        const hasTraceSource = status === 'running'
          || status === 'queued'
          || progressLines.length > 0
          || (Array.isArray(task.eventLog) && task.eventLog.length > 0)
          || (Array.isArray(task.toolCalls) && task.toolCalls.length > 0);
        const timeline = hasTraceSource ? buildChatTimeline(task, status) : null;
        const streaming = (status === 'running' || status === 'queued') && !error;
        const timelineItems = Array.isArray(timeline?.items) ? timeline.items : [];
        // Keep streamed answer segments in the trace so text and tool calls
        // stay in their original chronological order. The final answer moves
        // into the Markdown bubble only after the run completes.
        // Cancelled runs should not render a separate final-answer body or a
        // synthetic "Task was cancelled." message. Keep the chronological trace
        // intact, though: it is the running process (LLM stream + tool calls)
        // the user saw before pressing Stop.
        const bubbleText = streaming
          ? ''
          : (status === 'cancelled' ? '' : (error || answer));
        // Mid-run steering inputs ("user_input" timeline items) render as
        // independent user bubbles — exactly like normal asks — instead of
        // being embedded inside the assistant trace. Split the trace at each
        // runtime input so the message list reads:
        //   user ask → assistant work → user steer → assistant work → …
        // Each segment keeps its own time window (start → steering time / end),
        // so every segment shows its elapsed time instead of the generic
        // "Trace" fallback.
        const timelineToMs = (value) => {
          if (!value) return null;
          const ms = typeof value === 'number' ? value : Date.parse(String(value));
          return Number.isFinite(ms) && ms > 0 ? ms : null;
        };
        const traceSegments = [];
        let currentSegment = { timeline: [], userInput: null, startAt: null, endAt: null };
        let lastBoundaryMs = null;
        for (const item of timelineItems) {
          if (item.kind === 'user_input') {
            const boundaryMs = timelineToMs(item.timestamp);
            currentSegment.endAt = boundaryMs || lastBoundaryMs || null;
            traceSegments.push(currentSegment);
            currentSegment = {
              timeline: [],
              userInput: item,
              startAt: boundaryMs || null,
              endAt: null,
            };
            lastBoundaryMs = boundaryMs || lastBoundaryMs || null;
          } else {
            currentSegment.timeline.push(item);
          }
        }
        currentSegment.endAt = timelineToMs(task.completedAt);
        traceSegments.push(currentSegment);
        traceSegments.forEach((segment, segmentIndex) => {
          const isLast = segmentIndex === traceSegments.length - 1;
          if (segment.userInput) {
            taskRows.push({
              id: `${taskId}-runtime-input-${segment.userInput.id || segmentIndex}`,
              role: 'user',
              text: String(segment.userInput.text || ''),
              status: '',
              createdAt: timelineToMs(segment.userInput.timestamp) || task.createdAt,
              completedAt: task.completedAt,
              images: [],
            });
          }
          if (segment.timeline.length > 0 || isLast) {
            taskRows.push({
              id: `${taskId}-agent-${segmentIndex}`,
              taskId,
              conversationId,
              role: 'agent',
              text: isLast ? bubbleText : '',
              progressLines: isLast ? progressLines : [],
              traceTimeline: segment.timeline,
              traceLatestTodos: isLast ? (timeline?.latestTodos || null) : null,
              status,
              streaming: isLast && streaming,
              // A steering input closes the preceding assistant segment. Keep
              // that segment open while the same task continues so the user
              // can see the answer they are correcting.
              traceOpen: !isLast && streaming,
              // Earlier segments freeze at the steering boundary while the run
              // is active so their previous tool calls stay visible with their
              // own time pill; the final segment keeps the task-level clock,
              // identical to a normal task run.
              createdAt: isLast ? task.createdAt : (segment.startAt || task.createdAt),
              completedAt: isLast ? task.completedAt : (segment.endAt || task.completedAt),
              firstTokenAt: taskFirstStreamTimestamp(task),
            });
          }
        });
      }
      rowCache.set(task, taskRows);
      rows.push(...taskRows);
    }
    if (worldTaskState.pendingTask && !worldTaskState.activeTaskId) {
      const pendingStatus = normalizeTaskStatus(worldTaskState.pendingTask.status);
      const pendingError = String(worldTaskState.pendingTask.error || '').trim();
      // Empty user-cancelled pending turns are rolled back; skip rendering shells.
      if (!(pendingStatus === 'cancelled' && !pendingError && !taskHasAssistantStreamContent(worldTaskState.pendingTask))) {
        rows.push({
          id: `${worldTaskState.pendingTask.id || 'pending'}-user`,
          role: 'user',
          text: stripInjectedSkillInstruction(worldTaskState.pendingTask.title),
          status: pendingStatus,
          createdAt: worldTaskState.pendingTask.createdAt,
          completedAt: worldTaskState.pendingTask.completedAt,
          images: Array.isArray(worldTaskState.pendingTask.imageAttachments)
            ? worldTaskState.pendingTask.imageAttachments
            : [],
        });
        if (pendingError || pendingStatus === 'failed' || pendingStatus === 'cancelled' || pendingStatus === 'running' || pendingStatus === 'queued') {
          const pendingStreaming = (pendingStatus === 'running' || pendingStatus === 'queued') && !pendingError;
          rows.push({
            id: `${worldTaskState.pendingTask.id || 'pending'}-agent`,
            taskId: worldTaskState.pendingTask.id || '',
            conversationId,
            role: 'agent',
            text: pendingStreaming ? '' : (pendingStatus === 'cancelled' ? '' : pendingError),
            progressLines: [],
            traceTimeline: [],
            status: pendingStatus,
            streaming: pendingStreaming,
            createdAt: worldTaskState.pendingTask.createdAt,
            completedAt: worldTaskState.pendingTask.completedAt,
            firstTokenAt: taskFirstStreamTimestamp(worldTaskState.pendingTask),
          });
        }
      }
    }
    return rows;
  }, [conversationId, worldTaskState]);
  const currentConversation = useMemo(
    () => findConversationById(panelWorkspaceState, conversationId),
    [panelWorkspaceState, conversationId],
  );
  const lockedAgentId = currentConversation?.agentId
    || currentConversation?.tasks?.find((task) => task?.requestedAgentId)?.requestedAgentId
    || '';
  const hasUserMessages = chatMessages.some((message) => message.role === 'user');
  const agentLockedReason = lockedAgentId || hasUserMessages
    ? 'Cannot change agent for this conversation.'
    : '';
  const submitPending = Boolean(queuedDeploy);
  const agentSelectionLocked = Boolean(lockedAgentId || hasUserMessages);

  const composerDisabled = uploadState.active
    || calibrationMode
    || !!conversationError
    || (viewMode !== 'chat' && currentConversationRunning);

  return (
    <div className="app-shell">
      <TopBar
        now={now}
        viewMode={viewMode}
        onToggleViewMode={() => { handleToggleViewMode().catch((error) => showToast('error', String(error?.message || error))); }}
        calibrationActive={calibrationMode}
        onToggleCalibration={handleToggleCalibration}
      />
      <div className={`app-body ${calibrationMode ? 'settings-mode' : viewMode === 'chat' ? 'chat-mode' : 'world-mode'} ${!calibrationMode && conversationPanelCollapsed ? 'conversations-collapsed' : ''}`}>
        {calibrationMode ? (
          <SettingsPage
            activeSection={settingsSection}
            onSectionChange={setSettingsSection}
            selectionBySection={settingsSelection}
            onSelectionChange={setSettingsSelection}
            llmDraft={llmSettingsDraft}
            onLlmDraftChange={setLlmSettingsDraft}
            records={settingsRecordsDraft}
            onRecordsChange={setSettingsRecordsDraft}
            agentSettings={agentSettingsDraft}
            onAgentSettingsChange={setAgentSettingsDraft}
            workflowSettings={workflowSettingsDraft}
            onWorkflowSettingsChange={setWorkflowSettingsDraft}
            onSave={handleSaveSettingsDraft}
            onSaveTools={handleSaveToolsSettingsDraft}
            onDeleteLlmProvider={handleDeleteLlmProvider}
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
            onInstallSkill={handleInstallSkillDirectory}
            onToggleSkill={handleToggleSkill}
            onUninstallSkill={handleUninstallSkill}
            skillActionBusy={skillActionBusy}
          />
        ) : activeTab === 'dashboard' ? (
          <>
            <ConversationsPanel
              workspaceState={visiblePanelWorkspaceState}
              now={now}
              collapsed={conversationPanelCollapsed}
              onToggleCollapsed={() => setConversationPanelCollapsed((collapsed) => !collapsed)}
              authUser={authUser}
              onLogout={onLogout}
              onToast={showToast}
              onAddProject={() => { handleAddProject().catch((error) => { console.error('project add failed', error); showToast('error', String(error?.message || error)); }); }}
              onSelectProject={(projectId) => { handleSelectProject(projectId).catch((error) => { console.error('project select failed', error); showToast('error', String(error?.message || error)); }); }}
              onToggleProject={handleToggleProject}
              onRemoveProject={(projectId) => { handleRemoveProject(projectId).catch((error) => { console.error('project remove failed', error); showToast('error', String(error?.message || error)); }); }}
              onAddConversation={(projectId) => { handleAddConversation(projectId).catch((error) => { console.error('conversation add failed', error); showToast('error', String(error?.message || error)); }); }}
              onSelectConversation={(projectId, nextConversationId) => { handleSelectConversation(projectId, nextConversationId).catch((error) => { console.error('conversation select failed', error); showToast('error', String(error?.message || error)); }); }}
              onSelectTask={(projectId, targetConversationId, task) => { handleSelectWorkflowTask(projectId, targetConversationId, task).catch((error) => { console.error('task select failed', error); showToast('error', String(error?.message || error)); }); }}
              showTaskRecords={viewMode === 'chat'}
              workflowTaskMode={viewMode !== 'chat'}
              activeTaskId={currentWorkflowTask?.taskId || currentWorkflowTask?.id || null}
              onToggleConversationTasks={handleToggleConversationTasks}
              onToggleProjectConversations={handleToggleProjectConversations}
              onDeleteConversation={(projectId, nextConversationId) => { handleDeleteConversation(projectId, nextConversationId).catch((error) => { console.error('conversation delete failed', error); showToast('error', String(error?.message || error)); }); }}
              onDeleteTask={(projectId, targetConversationId, task) => { handleDeleteWorkflowTask(projectId, targetConversationId, task).catch((error) => { console.error('task delete failed', error); showToast('error', String(error?.message || error)); }); }}
              onRenameConversation={(projectId, nextConversationId, title) => { handleRenameConversation(projectId, nextConversationId, title).catch((error) => { console.error('conversation rename failed', error); showToast('error', String(error?.message || error)); }); }}
              onPinConversation={handlePinConversation}
              onPinProject={handlePinProject}
              onReorderConversations={handleReorderConversations}
              onReorderProjects={handleReorderProjects}
              onOpenTaskReport={handleOpenTaskReport}
              onRetryTask={handleRetryTask}
              taskPreviewLimit={viewMode === 'chat' ? 3 : 5}
            />
            {viewMode === 'chat' ? (
              <div className="app-chat-stage">
                <div className="app-chat-main">
	                  <ChatPanel
	                    conversationId={conversationId}
	                    composerScopeId={draftConversationRef.current?.composerScopeId || conversationId}
	                    messages={chatMessages}
	                    running={currentConversationRunning}
	                    disabled={composerDisabled}
	                    submitPending={submitPending}
	                    onSend={(text, attachment, modelId, reasoningEffort, imageAttachments, agentId, providerRequest, displayText) => handleDeploy(text, attachment, modelId, reasoningEffort, imageAttachments, agentId, providerRequest, displayText)}
                    onStop={handleStop}
                    onSelectFile={(file, selectedAgentId) => { handleAttachmentSelect(file, selectedAgentId, 'chat').catch((error) => console.error('attachment upload failed', error)); }}
                    onClearFile={handleAttachmentClear}
                    onUploadImage={uploadChatImage}
                    attachment={composerAttachment}
                    uploading={uploadState.active}
                    contextUsage={contextUsage}
                    workspacePath={localWorkspace.path}
                    homePath={window.haish?.homePath || ''}
                    activeTaskText={activeTaskText}
                    now={now}
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
		                  />
	                </div>
	              </div>
	            ) : (
	              <div className="app-workflow-stage">
                  <WorkflowRuntimePage
                    workflow={worldWorkflow}
                    task={currentWorkflowTask}
                    agentOptions={agentOptions}
                    now={now}
                    onRetry={(nodeId) => {
                      if (!currentWorkflowTask) return;
                      setViewedWorkflowTask(null);
                      executeWorkflowNodeRerun(currentWorkflowTask, nodeId).catch((error) => {
                        console.error('workflow node rerun failed', error);
                        showToast('error', String(error?.message || error));
                      });
                    }}
                    composer={<TaskDelegation onDeploy={handleDeploy} onStop={handleStop} onSelectFile={(file, selectedWorkflowId) => { handleAttachmentSelect(file, selectedWorkflowId, 'bot').catch((error) => console.error('attachment upload failed', error)); }} onClearFile={handleAttachmentClear} onSelectionChange={setSelectedWorkflowId} attachment={composerAttachment} uploading={uploadState.active} running={currentConversationRunning} disabled={composerDisabled} submitPending={submitPending} contextUsage={contextUsage} workspacePath={localWorkspace.path} homePath={window.haish?.homePath || ''} activeTaskText={activeTaskText} providerOptions={llmProviderOptions} agentOptions={workflowOptions} defaultAgentId={defaultWorkflowId} agentLoading={workflowLoading} agentLocked={false} agentLockedReason="" lockedAgentId="" selectionStorageKey={`${runConfigStorageKey}.bot`} draft={chatDraft} onDraftChange={setChatDraft} />}
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

      {toast && (
        <div className={`app-toast app-toast-${toast.kind}`} role="status" aria-live="polite">
          {toast.kind === 'success' ? (
            <span className="app-toast-icon app-toast-icon-success" aria-hidden="true" />
          ) : toast.kind === 'error' ? (
            <span className="app-toast-icon app-toast-icon-error" aria-hidden="true" />
          ) : (
            <span className="app-toast-icon app-toast-icon-info" aria-hidden="true" />
          )}
          <span className="app-toast-message">{toast.message}</span>
        </div>
      )}

      <HollowPurple open={!!hollow} title={hollow?.title} result={hollow?.result} onClose={()=>setHollow(null)} />
    </div>
  );
}

// Bridge for approval-dialog (legacy global lookup).
