// @haish-esm
import React from 'react';
import {
  CHAR_DEFS } from '../../Sprites.jsx';
import {
  STATIONS,
  CALIBRATION_IDS,
  NAV_POINTS,
  NAV_POINT_IDS,
  MEET_POINTS,
  MEET_POINT_IDS,
  ROUTES,
  ROUTE_IDS,
  ROUTE_EDITOR_DEFS,
  ROUTE_EDITOR_IDS,
  } from '../../World.jsx';
import { HollowPurple } from '../../Effects.jsx';
import { KIND_COLORS } from '../../orchestrator.js';
import {
  PortalTooltip,
  TopBar,
  ConversationsPanel,
  LiveFeedPanel,
  ChatPanel,
  TaskDelegation,
  MapViewport,
  TabPlaceholder,
  BottomNav,
  } from '../../panels.jsx';
import { normalizeToolName } from '../../lib/tool-names.js';
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
  clearAuthSession,
  getAuthAccessToken,
  loadStoredAuthSession,
  logoutCurrentSession,
  DEFAULT_PROJECT_ID,
  DEFAULT_PROJECT_NAME,
  DEFAULT_SESSION_NAME,
  DEFAULT_CONVERSATION_NAMES,
  DEFAULT_CONTEXT_TOTAL_TOKENS,
  RESTORED_CONTEXT_BASE_TOKENS,
  buildApiHeaders,
  parseResponseMessage,
  } from '../../api/auth.js';
import {
  APP_DEFAULT_AGENT_OPTIONS,
  DEFAULT_AGENT_SETTINGS,
  DEFAULT_WORKFLOW_SETTINGS,
  SETTINGS_SECTIONS,
  SETTINGS_SUBTABS,
  LLM_SETTINGS_STORAGE_KEY,
  SETTINGS_RECORDS_STORAGE_KEY,
  SETTINGS_CONNECTION_STATUS_STORAGE_KEY,
  normalizeAgentSettings,
  agentCatalogFromSettings,
  agentListItems,
  loadLlmSettingsDraft,
  loadSettingsRecordsDraft,
  loadSettingsConnectionStatus,
  persistSettingsConnectionStatus,
  applyLlmSettingsPayloadToDraft,
  createDefaultLlmSettings,
  createDefaultSettingsRecords,
  runtimeLlmProviderOptions,
  settingsConnectionSignatureFor,
  sanitizeSettingsConnectionStatus,
  createDefaultCustomAgentPayload,
  normalizeAgentProfileRow,
  SOFTWARE_DEVELOPMENT_WORKFLOW_ID,
  WEB_SEARCH_PROVIDER_OPTIONS,
  withAlwaysAllowedAgentTools,
  } from '../../lib/agent-catalog.js';
import {
  normalizeWorkflowSettings,
  createDefaultCustomWorkflowPayload,
  payloadForCustomWorkflow,
  workflowListItems,
  normalizeWorkflowRow,
  workflowById,
} from '../../lib/workflow-catalog.js';
import {
  MAP_W,
  MAP_H,
  CALIBRATION_NUDGE,
  DEFAULT_WALK_SPEED_PX_PER_SEC,
  WALK_SPEED_BY_ACTOR,
  DEFAULT_WALK_MIN_DURATION_MS,
  WALK_MIN_DURATION_BY_ACTOR,
  SCENE_WAIT_TIMEOUT_MS,
  CONVERSATION_BOOTSTRAP_MAX_ATTEMPTS,
  CONVERSATION_BOOTSTRAP_RETRY_DELAY_MS,
  THINKING_PULSE_INTERVAL_MS,
  STREAM_EVENT_BATCH_MS,
  POSE_DEBUG_DEFAULTS,
  POSE_DEBUG_OPTIONS,
  POSE_MAPPING_FIELDS,
  WORLD_ROLE_TO_ACTOR,
  WORLD_KIND_MAP,
  PROVIDER_ACTOR_MAP,
  workflowNodeActorBindings,
  } from '../../lib/world-runtime.js';
import {
  createEmptyContextUsage,
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
  saveWorkspaceState,
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
  projectNameFromPath,
  normalizeChatImageRefs,
  mergeChatImageRefs,
  chatImagePreviewUrl,
  createEmptyWorkspaceState,
  createDefaultProject,
  stripChatImageAugmentation,
  isProtectedChatImagePreviewUrl,
  mergeChatImageRefValue,
  chatImageFallbacksByTaskIdFromMessages,
  timestampValue,
  taskUpdatedTimestamp,
  taskCreatedTimestamp,
  conversationUpdatedTimestamp,
  projectUpdatedTimestamp,
  inferProjectCreatedAt,
  projectCreatedTimestamp,
  withDefaultExpansion,
  conversationHasActiveTask,
  isTaskActuallyActive,
  projectIdForWorkspacePath,
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
  upsertToolCall,
  getLiveEventStatus,
  normalizeLiveEntryStatus,
  legacyLiveEntries,
  } from '../../lib/task-runtime.js';
import {
  buildChatTimeline,
  getChatProgressLine,
  appendChatProgressText,
  appendAnswerDelta,
  eventDeltaText,
  extractTodosFromToolItem,
  pendingTaskToQuest,
  getToolResponseTraceStatus,
} from '../../lib/chat-timeline.js';
import {
  clonePointMap, clamp01, roundCoord, serializePointMap, serializePoseConfigMap,
} from '../../lib/calibration-utils.js';
import {
  normalizeWorldEvent, normalizeWorldEvents, worldEventToRuntimeLog, resolveProviderMeta,
  normalizeProviderKey, getWorldEventTag, executorActorForToolGroup, sceneKeyForWorldEvent,
  skillDisplayName, skillLoadingBubble, skillReadyBubble, summarizeText, toDisplayText,
  defaultQuestDescription, getLoopIndexFromWorldEvents, getActiveRoleFromWorldEvents,
  WORLD_EVENT_ROUTE_MAP, WORLD_SCENE_EVENT_TYPES, PROVIDER_SCENE_EVENT_TYPES,
  WORKFLOW_SCENE_EVENT_TYPES,
  STREAM_IMMEDIATE_EVENT_TYPES, SCENE_CATCHUP_TOOL_EVENT_TYPES, SCENE_CATCHUP_KEEP_TYPES,
  SCENE_TERMINAL_EVENT_TYPES, CHAT_FINAL_FOLLOWUP_EVENT_TYPES, WORLD_EVENT_TYPE_ALIASES,
} from '../../lib/world-events.js';
import { BotWorld } from '../../panels/world/BotWorld.jsx';

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

const { useState, useEffect, useRef, useMemo } = React;

export function AppShell({ authUser = null, onLogout = () => undefined, initialToast = null }) {
  const [worldTaskState, setWorldTaskState] = useState(() => createEmptyWorldTaskState());
  const [workspaceState, setWorkspaceState] = useState(() => loadStoredWorkspaceState());
  const [activeTab, setActiveTab] = useState('dashboard');
  const [viewMode, setViewMode] = useState('chat');
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('');
  const viewModeRef = useRef('chat');
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
  const [mapView, setMapView] = useState(null);
  const [conversationId, setConversationId] = useState(null);
  const [conversationReady, setConversationReady] = useState(false);
  const [conversationError, setConversationError] = useState('');
  const [conversationAttachments, setConversationAttachments] = useState([]);
  const [contextUsage, setContextUsage] = useState(() => createEmptyContextUsage(null));
  const [localWorkspace, setLocalWorkspace] = useState({ path: null, label: null });
  const [composerAttachment, setComposerAttachment] = useState(null);
  const [chatDraft, setChatDraft] = useState('');
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
  const originalStationsRef = useRef(clonePointMap(STATIONS));
  const originalNavRef = useRef(clonePointMap(NAV_POINTS));
  const originalMeetRef = useRef(clonePointMap(MEET_POINTS));
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
    workflow: SOFTWARE_DEVELOPMENT_WORKFLOW_ID,
  }));
  const [skillActionBusy, setSkillActionBusy] = useState('');
  const [calibrationTarget, setCalibrationTarget] = useState('stations');
  const [selectedMarkerId, setSelectedMarkerId] = useState(CALIBRATION_IDS[0]);
  const [selectedRouteId, setSelectedRouteId] = useState(ROUTE_EDITOR_IDS[0] || ROUTE_IDS[0] || null);
  const [selectedPoseNpcId, setSelectedPoseNpcId] = useState(CALIBRATION_IDS[0]);
  const [selectedPoseMappingKey, setSelectedPoseMappingKey] = useState(POSE_MAPPING_FIELDS[0].key);
  const [selectedPoseSourceKey, setSelectedPoseSourceKey] = useState(null);
  const [stationDrafts, setStationDrafts] = useState(() => clonePointMap(STATIONS));
  const [navDrafts, setNavDrafts] = useState(() => clonePointMap(NAV_POINTS));
  const [meetDrafts, setMeetDrafts] = useState(() => clonePointMap(MEET_POINTS));
  const [copiedCoords, setCopiedCoords] = useState(false);
  const activeTaskIdRef = useRef(null);
  const activeRunIdRef = useRef(null);
  const conversationIdRef = useRef(null);
  const cancelledRunIdsRef = useRef(new Set());
  const fetchAbortRef = useRef(null);
  const conversationDetailAbortRef = useRef(null);
  const answerBufferRef = useRef('');
  const chatFinalizedTaskIdsRef = useRef(new Set());
  const userCancelledTaskIdsRef = useRef(new Set());
  const taskImageAttachmentsRef = useRef(new Map());
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
    authFetch(`${API_BASE}/api/agents`, { method: 'GET' }, { json: false })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const rows = Array.isArray(data) ? data : (Array.isArray(data.agents) ? data.agents : []);
        const options = rows
          .map((item) => {
            const id = String(item?.agent_id || item?.id || item?.profile_id || '').trim();
            if (!id) return null;
            return {
              id,
              label: String(item?.display_name || item?.label || id).trim() || id,
              description: String(item?.description || '').trim(),
              custom: Boolean(item?.custom),
              canUploadDocuments: item?.can_upload_documents === true,
            };
          })
          .filter(Boolean);
        if (options.length > 0) {
          setAgentCatalog({
            options,
            defaultAgentId: options.find((item) => item.id === 'preset.general')?.id || options[0].id,
          });
        }
      })
      .catch((error) => console.warn('failed to fetch assistant agents', error))
      .finally(() => {
        if (!cancelled) setAgentLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchWorkflowSettingsPayload()
      .then((payload) => {
        if (!cancelled) applyWorkflowSettingsPayload(payload);
      })
      .catch((error) => console.warn('failed to fetch workflow catalog', error))
      .finally(() => {
        if (!cancelled) setWorkflowLoading(false);
      });
    return () => { cancelled = true; };
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
    if (!calibrationMode || settingsSection !== 'agent') return undefined;
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
    || SOFTWARE_DEVELOPMENT_WORKFLOW_ID;

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
    restoreTaskRuntime,
    restoreLatestTaskRuntime,
    restoreConversationTaskRuntimes,
    cancelActiveTask,
    cancelActiveConversationTask,
    activeTaskIdFromConversationSnapshot,
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
        if (storedConversationIds.length > 0) {
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
        const previousWorkspaceState = storedConversationIds.length > 0
          ? {
            ...workspaceState,
            activeConversationId: storedConversationId || workspaceState.activeConversationId,
          }
          : createEmptyWorkspaceState();
        const nextWorkspaceState = buildWorkspaceStateFromConversationDetails(details, previousWorkspaceState);
        setWorkspaceState(nextWorkspaceState);
        const activeDetail = details.find((detail) => detail.conversation_id === nextWorkspaceState.activeConversationId) || details[0];
        if (activeDetail) {
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
    createEmptyRuntime,
    getRuntime,
    mutateRuntime,
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
    cacheTaskImageAttachments,
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
    runtimeTaskFromConversationTask,
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
    resolvePoint,
    resolvePathSpec,
    orientToward,
    syncNpcPositions,
    clearAllPoseDebug,
    setPoseDebug,
    getPoseDebugForMapping,
    syncPosePreview,
    getCharPoseConfig,
    getPoseMappingValue,
    applyPoseMapping,
    getPoseFrameOptions,
    resetPoseMapping,
    getIdsForTarget,
    getDraftsForTarget,
    getSourceMapForTarget,
    resolvePointTarget,
    getFirstRouteRef,
    getPointDisplayName,
    setPointPosition,
    stagePointFromClient,
    handleMarkerPointerDown,
    prepareWorldCalibration,
  } = createWorldCalibrationHandlers({
    CALIBRATION_IDS,
    CHAR_DEFS,
    MAP_H,
    MAP_W,
    MEET_POINTS,
    MEET_POINT_IDS,
    NAV_POINTS,
    POSE_DEBUG_DEFAULTS,
    POSE_DEBUG_OPTIONS,
    POSE_MAPPING_FIELDS,
    ROUTES,
    ROUTE_EDITOR_DEFS,
    STATIONS,
    busy,
    clamp01,
    clonePointMap,
    dirFromTo,
    dragStateRef,
    meetDrafts,
    navDrafts,
    npcStatesRef,
    roundCoord,
    selectedRouteId,
    setCalibrationTarget,
    setCopiedCoords,
    setMeetDrafts,
    setNavDrafts,
    setNpcStates,
    setSelectedMarkerId,
    setStationDrafts,
    stageRef,
    stationDrafts,
    updateNpc,
    worldCalibrationActive,
  });

  worldRouteApiRef.current = {
    orientToward,
  };

  const {
    distancePx,
    resolveScenePlaybackContext,
    buildSceneItem,
    appendTaskEvent,
    dropPendingSceneItems,
    clearSceneWaitState,
    sceneToolKey,
    sceneThinkingKey,
    rememberSceneCompletion,
    resolveSceneThinkingWaitersForTask,
    waitForSceneCompletion,
    findLastSceneItem,
    compactPendingSceneItems,
    markAgentLive,
    stopThinkingPulse,
    stopThinkingPulsesForTask,
    startThinkingPulse,
    setActorIdle,
    setActorActive,
    returnActorHome,
    resetSceneActors,
    completeTaskAgents,
    finalizeTaskPresentation,
    isChatOriginTask,
    isBotWorkflowTask,
    pumpSceneQueue,
    enqueueSceneEvent,
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
    busy,
    completeAgentLiveEntries,
    conversationId,
    executorActorForToolGroup,
    getTaskById,
    legacyLiveEntries,
    mergeAgentLiveEntry,
    normalizeTaskStatus,
    now,
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
    handleSettingsSectionChange,
    handleToggleCalibration,
    handleSaveSettingsDraft,
    handleSaveToolsSettingsDraft,
    applyAgentSettingsPayload,
    fetchAgentSettingsPayload,
    customAgentPayload,
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
    handleResetCalibration,
  } = createSettingsHandlers({
    API_BASE,
    CALIBRATION_IDS,
    LLM_SETTINGS_STORAGE_KEY,
    MEET_POINTS,
    NAV_POINTS,
    SETTINGS_RECORDS_STORAGE_KEY,
    STATIONS,
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
    calibrationTarget,
    clearAllPoseDebug,
    clonePointMap,
    createDefaultCustomAgentPayload,
    createDefaultCustomWorkflowPayload,
    dragStateRef,
    getIdsForTarget,
    getSelectedLlmConfig,
    getSourceMapForTarget,
    llmProviderRequestPayload,
    llmSettingsDraft,
    normalizeAgentSettings,
    normalizeWorkflowSettings,
    originalMeetRef,
    originalNavRef,
    originalStationsRef,
    parseResponseMessage,
    payloadForCustomWorkflow,
    prepareWorldCalibration,
    resetPoseMapping,
    resolvePointTarget,
    setActiveTab,
    setAgentCatalog,
    setAgentSettingsDraft,
    setCalibrationMode,
    setCopiedCoords,
    setLlmSettingsDraft,
    setMeetDrafts,
    setNavDrafts,
    setSettingsRecordsDraft,
    setSettingsSection,
    setSkillActionBusy,
    setStationDrafts,
    setWorkflowSettingsDraft,
    settingsConnectionSignatureFor,
    settingsRecordsDraft,
    showToast,
    syncNpcPositions,
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
    toDisplayText,
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
    pickLocalWorkspace,
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
    readNdjsonStream,
    applyWorldEvent,
    executeQuest,
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
    applyTerminalTaskState,
    authFetch,
    buildApiHeaders,
    buildAgentLiveSnapshot,
    chatFinalizedTaskIdsRef,
    compactPendingSceneItems,
    completeAgentLiveEntries,
    completeLatestAgentLiveEntry,
    completeTaskAgents,
    conversationId,
    conversationIdRef,
    defaultQuestDescription,
    dropPendingSceneItems,
    ensureTaskForEvent,
    eventDeltaText,
    extractTodosFromToolItem,
    finalizeTaskPresentation,
    flushRuntimeTasksToWorkspace,
    generateHexId,
    getActiveRoleFromWorldEvents,
    getChatProgressLine,
    getLoopIndexFromWorldEvents,
    getRuntime,
    getTaskById,
    getToolResponseTraceStatus,
    isBotWorkflowTask,
    isChatOriginTask,
    isTerminalTaskStatus,
    mergeAgentLiveEntry,
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
    setAgentLive,
    setComposerAttachment,
    setContextUsage,
    setHollow,
    setRuntimeActiveTaskId,
    setRuntimeAnswerBuffer,
    setRuntimeBusy,
    setRuntimeFetchController,
    setUploadState,
    showToast,
    stopThinkingPulse,
    stopThinkingPulsesForTask,
    streamTargetConvIdRef,
    stripChatImageAugmentation,
    taskHasAssistantStreamContent,
    taskImageAttachmentsRef,
    toDisplayText,
    updateTaskById,
    updateWorldTaskState,
    uploadAttachment,
    upsertToolCall,
    userCancelledTaskIdsRef,
    userIdRef,
    worldEventToRuntimeLog,
  });


  const {
    handleSelectConversation,
    handleSelectProject,
    handleToggleProject,
    handleToggleConversation,
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
    materializeDraftConversationForSend,
    normalizeWorkspaceOrdering,
    now,
    openDraftConversation,
    projectIdForWorkspacePath,
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
    withDefaultExpansion,
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
    startDeploy,
    handleDeploy,
  } = createDeployHandlers({
    API_BASE,
    APP_DEFAULT_AGENT_OPTIONS,
    abortRef,
    activeRunIdRef,
    activeTaskIdRef,
    answerBufferRef,
    applyTerminalTaskState,
    authFetch,
    buildApiHeaders,
    busy,
    cancelActiveConversationTask,
    cancelActiveTask,
    chatFinalizedTaskIdsRef,
    clearDraftConversationState,
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
    pendingPresentationTaskIdsRef,
    queuedDeploy,
    readRuntimeAnswerBuffer,
    resetSceneActors,
    selectedConversationId,
    setAgentLive,
    setBusy,
    setChatDraft,
    setComposerAttachment,
    setHollow,
    setQueuedDeploy,
    setRuntimeActiveRunId,
    setRuntimeActiveTaskId,
    setRuntimeAnswerBuffer,
    setRuntimeBusy,
    setRuntimeFetchController,
    setUploadState,
    setWorkspaceState,
    showToast,
    streamTargetConvIdRef,
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
    workspaceStateWithConversationRuntimeTask,
    workspaceStateWithTouchedConversation,
    worldTaskStateRef,
  });
  deployApiRef.current = {
    buildDeployRequest,
    canStartDeployForConversation,
    startDeploy,
    handleDeploy,
    handleStop,
    removeConversationTaskFromWorkspace,
  };

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
    projects: panelWorkspaceState.projects.map((project) => ({
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
          if (!canStartDeployForConversation(realConversationId)) {
            setQueuedDeploy(request);
            return;
          }
          startDeploy(request, realConversationId, materialized?.detail || null);
        })
        .catch((error) => {
          console.error('draft conversation create failed', error);
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
    const tick = () => {
      if (cancelled) return;
      restoreLatestTaskRuntime(activeTaskIdForPolling).catch((error) => {
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
  }, [activeTaskIdForPolling]);
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
  const currentTask = useMemo(() => {
    if (worldTaskState.activeTaskId && worldTaskState.tasksById[worldTaskState.activeTaskId]) {
      return worldTaskState.tasksById[worldTaskState.activeTaskId];
    }
    if (worldTaskState.pendingTask) {
      return null;
    }
    const latestTaskId = worldTaskState.taskOrder[worldTaskState.taskOrder.length - 1];
    return latestTaskId ? worldTaskState.tasksById[latestTaskId] || null : null;
  }, [worldTaskState]);
  const worldWorkflow = useMemo(() => {
    const selected = workflowById(workflowSettingsDraft, selectedWorkflowId || defaultWorkflowId);
    return currentTask?.executionMode === 'bot' && isTaskActuallyActive(currentTask) && currentTask.workflowSnapshot
      ? currentTask.workflowSnapshot
      : selected;
  }, [currentTask, defaultWorkflowId, selectedWorkflowId, workflowSettingsDraft]);
  useEffect(() => {
    const activeTaskId = worldTaskState.activeTaskId || activeTaskIdRef.current;
    if (!activeTaskId || !currentTask) return;
    if (isTaskActuallyActive(currentTask)) return;
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
  }, [busy, currentConversationActive, currentTask, worldTaskState.activeTaskId]);
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
    for (const task of orderedTasks) {
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
        rows.push({
          id: `${taskId}-user`,
          role: 'user',
          text: task.title,
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
        const visibleTimelineItems = timelineItems;
        const bubbleText = streaming
          ? ''
          : (status === 'cancelled' ? '' : (error || answer));
        rows.push({
          id: `${taskId}-agent`,
          role: 'agent',
          text: bubbleText,
          progressLines,
          traceTimeline: visibleTimelineItems,
          traceLatestTodos: timeline?.latestTodos || null,
          status,
          streaming,
          createdAt: task.createdAt,
          completedAt: task.completedAt,
        });
      }
    }
    if (worldTaskState.pendingTask && !worldTaskState.activeTaskId) {
      const pendingStatus = normalizeTaskStatus(worldTaskState.pendingTask.status);
      const pendingError = String(worldTaskState.pendingTask.error || '').trim();
      // Empty user-cancelled pending turns are rolled back; skip rendering shells.
      if (!(pendingStatus === 'cancelled' && !pendingError && !taskHasAssistantStreamContent(worldTaskState.pendingTask))) {
        rows.push({
          id: `${worldTaskState.pendingTask.id || 'pending'}-user`,
          role: 'user',
          text: worldTaskState.pendingTask.title,
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
            role: 'agent',
            text: pendingStreaming ? '' : (pendingStatus === 'cancelled' ? '' : pendingError),
            progressLines: [],
            traceTimeline: [],
            status: pendingStatus,
            streaming: pendingStreaming,
            createdAt: worldTaskState.pendingTask.createdAt,
            completedAt: worldTaskState.pendingTask.completedAt,
          });
        }
      }
    }
    return rows;
  }, [worldTaskState]);
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

  const activeIds = getIdsForTarget(calibrationTarget);
  const activeDrafts = getDraftsForTarget(calibrationTarget);
  const calibrationExport = calibrationTarget === 'routes' ? `${serializePointMap('NAV_POINTS', NAV_POINT_IDS, navDrafts)}\n\n${serializePointMap('MEET_POINTS', MEET_POINT_IDS, meetDrafts)}` : calibrationTarget === 'nav' ? serializePointMap('NAV_POINTS', activeIds, navDrafts) : calibrationTarget === 'meet' ? serializePointMap('MEET_POINTS', activeIds, meetDrafts) : serializePointMap('STATIONS', activeIds, stationDrafts, true);
  const selectedPoseLabel = CHAR_DEFS[selectedPoseNpcId]?.name || selectedPoseNpcId;
  const routeEditorIds = ROUTE_EDITOR_IDS || [];
  const selectedPoseMapping = POSE_MAPPING_FIELDS.find((item) => item.key === selectedPoseMappingKey) || POSE_MAPPING_FIELDS[0];
  const selectedMappingFrame = getPoseMappingValue(selectedPoseNpcId, selectedPoseMapping.key);
  const selectedPoseFrameOptions = getPoseFrameOptions(selectedPoseNpcId);
  const poseExport = serializePoseConfigMap(CALIBRATION_IDS, getCharPoseConfig);
  const leftMapEdgeReached = !mapView || mapView.tx >= -2;
  const rightMapEdgeReached = !mapView || (mapView.tx + MAP_W * mapView.scale) <= (mapView.viewportWidth + 2);
  const baseMapExtensionStyle = mapView ? {
    '--panel-map-width': `${MAP_W * mapView.scale}px`,
    '--panel-map-height': `${MAP_H * mapView.scale}px`,
    '--panel-map-tx': `${mapView.tx}px`,
    '--panel-map-ty': `${mapView.ty}px`,
    '--map-viewport-width': `${mapView.viewportWidth}px`,
  } : null;
  const leftPanelExtensionStyle = baseMapExtensionStyle ? {
    ...baseMapExtensionStyle,
    '--panel-map-opacity': leftMapEdgeReached ? '0' : '0.62',
  } : undefined;
  const rightPanelExtensionStyle = baseMapExtensionStyle ? {
    ...baseMapExtensionStyle,
    '--panel-map-opacity': rightMapEdgeReached ? '0' : '0.62',
  } : undefined;
  const composerDisabled = currentConversationRunning || uploadState.active || calibrationMode || !!conversationError;

  return (
    <div className="app-shell">
      <TopBar
        now={now}
        viewMode={viewMode}
        onToggleViewMode={() => { handleToggleViewMode().catch((error) => showToast('error', String(error?.message || error))); }}
        calibrationActive={calibrationMode}
        onToggleCalibration={handleToggleCalibration}
        calibrationDisabled={busy}
      />
      <div className={`app-body ${calibrationMode ? 'settings-mode' : viewMode === 'chat' ? 'chat-mode' : 'world-mode'}`}>
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
              authUser={authUser}
              onLogout={onLogout}
              onToast={showToast}
              extensionStyle={leftPanelExtensionStyle}
              onAddProject={() => { handleAddProject().catch((error) => { console.error('project add failed', error); showToast('error', String(error?.message || error)); }); }}
              onSelectProject={(projectId) => { handleSelectProject(projectId).catch((error) => { console.error('project select failed', error); showToast('error', String(error?.message || error)); }); }}
              onToggleProject={handleToggleProject}
              onRemoveProject={(projectId) => { handleRemoveProject(projectId).catch((error) => { console.error('project remove failed', error); showToast('error', String(error?.message || error)); }); }}
              onAddConversation={(projectId) => { handleAddConversation(projectId).catch((error) => { console.error('conversation add failed', error); showToast('error', String(error?.message || error)); }); }}
              onSelectConversation={(projectId, nextConversationId) => { handleSelectConversation(projectId, nextConversationId).catch((error) => { console.error('conversation select failed', error); showToast('error', String(error?.message || error)); }); }}
              onToggleConversation={handleToggleConversation}
              onToggleConversationTasks={handleToggleConversationTasks}
              onToggleProjectConversations={handleToggleProjectConversations}
              onDeleteConversation={(projectId, nextConversationId) => { handleDeleteConversation(projectId, nextConversationId).catch((error) => { console.error('conversation delete failed', error); showToast('error', String(error?.message || error)); }); }}
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
	                    messages={chatMessages}
	                    running={currentConversationRunning}
	                    disabled={composerDisabled}
	                    submitPending={submitPending}
	                    onSend={(text, attachment, modelId, reasoningEffort, imageAttachments, agentId, providerRequest) => handleDeploy(text, attachment, modelId, reasoningEffort, imageAttachments, agentId, providerRequest)}
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
	              <>
                <div className="app-center-stage">
                  <MapViewport
	                    MAP_W={MAP_W}
	                    MAP_H={MAP_H}
	                    onViewChange={setMapView}
                    overlay={<TaskDelegation onDeploy={handleDeploy} onStop={handleStop} onSelectFile={(file, selectedWorkflowId) => { handleAttachmentSelect(file, selectedWorkflowId, 'bot').catch((error) => console.error('attachment upload failed', error)); }} onClearFile={handleAttachmentClear} onSelectionChange={setSelectedWorkflowId} attachment={composerAttachment} uploading={uploadState.active} running={currentConversationRunning} disabled={composerDisabled} submitPending={submitPending} contextUsage={contextUsage} workspacePath={localWorkspace.path} homePath={window.haish?.homePath || ''} activeTaskText={activeTaskText} providerOptions={llmProviderOptions} agentOptions={workflowOptions} defaultAgentId={defaultWorkflowId} agentLoading={workflowLoading} agentLocked={false} agentLockedReason="" lockedAgentId="" selectionStorageKey={`${runConfigStorageKey}.bot`} />}
                  >
                    <BotWorld
                      stageRef={stageRef}
                      workflow={currentTask?.executionMode === 'bot' && currentTask?.workflowSnapshot ? currentTask.workflowSnapshot : worldWorkflow}
                      task={currentTask}
                      onOpenReport={handleOpenTaskReport}
                    />
	                  </MapViewport>
	                </div>
	                <LiveFeedPanel agentLive={agentLive} now={now} extensionStyle={rightPanelExtensionStyle} currentTask={currentTask} />
	              </>
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
