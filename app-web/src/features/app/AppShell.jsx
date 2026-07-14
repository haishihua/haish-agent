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
  NPC,
  CalibrationPoint,
  CalibrationRoutePreview,
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
  normalizeToolName,
  } from '../../panels.jsx';
import {
  SettingsPage,
  applyToolsSettingsPayloadToRecords,
  applyMemorySettingsPayloadToRecords,
  applyKnowledgeSettingsPayloadToRecords,
  buildToolsSettingsPayload,
  buildMemorySettingsPayload,
  buildKnowledgeSettingsPayload,
  getSelectedLlmConfig,
  llmProviderRequestPayload,
  updateSelectedLlmConfig,
} from '../settings/SettingsPage.jsx';
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
  const [bursts, setBursts] = useState([]);
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
  const [modelCatalog, setModelCatalog] = useState(() => ({ options: [], defaultModelId: '', provider: '' }));
  const [providerLoading, setProviderLoading] = useState(true);
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
    authFetch(`${API_BASE}/api/llm/models`, { method: 'GET' }, { json: false })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        if (Array.isArray(data.models) && data.models.length > 0) {
          setModelCatalog({
            options: data.models,
            defaultModelId: data.default_model || data.models[0].id,
            provider: String(data.provider || '').trim(),
          });
        }
      })
      .catch((error) => console.warn('failed to fetch provider models', error))
      .finally(() => {
        if (!cancelled) setProviderLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

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

  const modelOptions = modelCatalog?.options;
  const defaultModelId = modelCatalog?.defaultModelId;
  const llmProviderOptions = useMemo(() => runtimeLlmProviderOptions(llmSettingsDraft, modelCatalog), [llmSettingsDraft, modelCatalog]);
  const modelProviderKey = llmProviderOptions.map((item) => item.requestProvider || item.id).join('|') || 'unconfigured';
  const agentOptions = agentCatalog?.options || APP_DEFAULT_AGENT_OPTIONS;
  const defaultAgentId = agentCatalog?.defaultAgentId || APP_DEFAULT_AGENT_OPTIONS[0].id;
  const runConfigStorageKey = buildRunConfigStorageKey(authUser, modelProviderKey);
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

  function invalidateConversationActivation() {
    conversationActivationSeqRef.current += 1;
    return conversationActivationSeqRef.current;
  }

  function isConversationActivationCurrent(seq) {
    return conversationActivationSeqRef.current === seq;
  }

  async function fetchTaskRuntimeDetail(taskId) {
    if (!taskId) return null;
    const response = await authFetch(`${API_BASE}/api/tasks/${taskId}`, {
      method: 'GET',
    }, { json: false });
    if (!response.ok) {
      throw new Error(`task restore failed: ${response.status}`);
    }
    const task = await response.json();
    const events = normalizeWorldEvents(task.events);
    return { normalizedTask: { ...task, events }, events };
  }

  async function restoreTaskRuntime(taskId, { isCurrentActivation = () => true, updateLiveSnapshot = false } = {}) {
    if (!isCurrentActivation()) return;
    const detail = await fetchTaskRuntimeDetail(taskId);
    if (!detail || !isCurrentActivation()) return;
    const { normalizedTask, events } = detail;
    updateWorldTaskState((state) => ({
      ...state,
      tasksById: {
        ...state.tasksById,
        [taskId]: taskDetailToRuntimeTask(normalizedTask, state.tasksById[taskId] || null, userIdRef.current),
      },
    }));
    if (updateLiveSnapshot) {
      setAgentLive(buildAgentLiveSnapshot(normalizedTask, events));
    }
  }

  async function restoreLatestTaskRuntime(taskId, isCurrentActivation = () => true) {
    if (!taskId) {
      if (isCurrentActivation()) setAgentLive({});
      return;
    }
    await restoreTaskRuntime(taskId, { isCurrentActivation, updateLiveSnapshot: true });
  }

  async function restoreConversationTaskRuntimes(taskIds, latestTaskId, isCurrentActivation = () => true) {
    const uniqueTaskIds = [...new Set((Array.isArray(taskIds) ? taskIds : []).filter(Boolean))];
    if (latestTaskId && uniqueTaskIds.includes(latestTaskId)) {
      try {
        await restoreLatestTaskRuntime(latestTaskId, isCurrentActivation);
      } catch (error) {
        if (isCurrentActivation()) {
          console.warn(`task detail restore skipped: ${latestTaskId}`, error);
        }
      }
    } else if (isCurrentActivation()) {
      setAgentLive({});
    }
    const detailTaskIds = uniqueTaskIds.filter((taskId) => taskId !== latestTaskId);
    for (const taskId of detailTaskIds) {
      if (!isCurrentActivation()) return;
      try {
        await restoreTaskRuntime(taskId, { isCurrentActivation });
      } catch (error) {
        if (isCurrentActivation()) {
          console.warn(`task detail restore skipped: ${taskId}`, error);
        }
      }
    }
  }

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

  function pushBurst(pos, color) {
    const id = Math.random().toString(36).slice(2);
    const x = pos.x * MAP_W;
    const y = pos.y * MAP_H - 32;
    setBursts(B => [...B, { id, x, y, color }]);
    setTimeout(() => setBursts(B => B.filter(b => b.id !== id)), 1400);
  }

  function updateNpc(actor, patchOrFn) {
    setNpcStates(state => {
      const patch = typeof patchOrFn === 'function' ? patchOrFn(state[actor]) : patchOrFn;
      const next = { ...state, [actor]: { ...state[actor], ...patch } };
      npcStatesRef.current = next;
      return next;
    });
  }

  function createEmptyRuntime() {
    return {
      worldTaskState: createEmptyWorldTaskState(),
      busy: false,
      activeRunId: null,
      activeTaskId: null,
      fetchController: null,
      answerBuffer: '',
      cancelledRunIds: new Set(),
      abortRequested: false,
      shellSeeded: false,
    };
  }

  function getRuntime(convId, { create = false } = {}) {
    if (!convId) return null;
    const map = runtimesRef.current;
    let rt = map.get(convId);
    if (!rt && create) {
      rt = createEmptyRuntime();
      map.set(convId, rt);
    }
    return rt || null;
  }

  // Mutate a conversation's runtime in place. If `convId` is the conversation
  // currently shown in the UI, also mirror the relevant fields to the displayed
  // React state + legacy refs so existing render paths keep working.
  function mutateRuntime(convId, mutator) {
    if (!convId) return null;
    const rt = getRuntime(convId, { create: true });
    mutator(rt);
    if (convId === conversationIdRef.current) {
      syncDisplayedRuntime(rt);
    }
    return rt;
  }

  // Snapshot a runtime's task state into the displayed React state + refs.
  // Called on conversation switch and after every mutation that targeted the
  // currently-shown conversation.
  function syncDisplayedRuntime(rt) {
    if (!rt) return;
    activeRunIdRef.current = rt.activeRunId;
    activeTaskIdRef.current = rt.activeTaskId;
    fetchAbortRef.current = rt.fetchController;
    answerBufferRef.current = rt.answerBuffer;
    cancelledRunIdsRef.current = rt.cancelledRunIds;
    worldTaskStateRef.current = rt.worldTaskState;
    cacheTaskImageAttachments(rt.worldTaskState);
    setWorldTaskState(rt.worldTaskState);
    setBusy(rt.busy);
  }

  function activeRuntimeTargetConvId(explicit) {
    return explicit || streamTargetConvIdRef.current || conversationIdRef.current;
  }

  function setRuntimeBusy(value, explicit = null) {
    const cid = activeRuntimeTargetConvId(explicit);
    if (cid) {
      mutateRuntime(cid, (rt) => { rt.busy = value; });
      // Task just finished (or was cancelled/errored) — mirror the runtime's
      // task state back into workspaceState so the sidebar entry for THIS
      // conversation reflects the new "done" status, even when the user is
      // currently viewing a different conversation. Otherwise the spinner
      // next to the backgrounded conversation never goes away until the user
      // navigates into it and triggers a re-fetch.
      if (value === false) flushRuntimeTasksToWorkspace(cid);
    } else {
      setBusy(value);
    }
  }

  function flushRuntimeTasksToWorkspace(convId) {
    if (!convId) return;
    const rt = runtimesRef.current.get(convId);
    if (!rt) return;
    const snapshot = rt.worldTaskState;
    const taskOrder = Array.isArray(snapshot?.taskOrder) ? snapshot.taskOrder : [];
    const tasksById = snapshot?.tasksById || {};
    const currentTasks = taskOrder.map((taskId) => tasksById[taskId]).filter(Boolean);
    if (currentTasks.length === 0) return;
    setWorkspaceState((state) => {
      let touched = false;
      const projects = state.projects.map((project) => {
        if (!project.conversations.some((c) => c.id === convId)) return project;
        touched = true;
        const now = Date.now();
        return {
          ...project,
          updatedAt: now,
          conversations: project.conversations.map((c) => (
            c.id === convId ? { ...c, tasks: currentTasks, updatedAt: now } : c
          )),
        };
      });
      if (!touched) return state;
      return normalizeWorkspaceOrdering({ ...state, projects });
    });
  }
  function setRuntimeActiveTaskId(value, explicit = null) {
    const cid = activeRuntimeTargetConvId(explicit);
    if (cid) mutateRuntime(cid, (rt) => { rt.activeTaskId = value; });
    else activeTaskIdRef.current = value;
  }
  function setRuntimeActiveRunId(value, explicit = null) {
    const cid = activeRuntimeTargetConvId(explicit);
    if (cid) mutateRuntime(cid, (rt) => { rt.activeRunId = value; });
    else activeRunIdRef.current = value;
  }
  function setRuntimeFetchController(value, explicit = null) {
    const cid = activeRuntimeTargetConvId(explicit);
    if (cid) mutateRuntime(cid, (rt) => { rt.fetchController = value; });
    else fetchAbortRef.current = value;
  }
  function setRuntimeAnswerBuffer(value, explicit = null) {
    const cid = activeRuntimeTargetConvId(explicit);
    if (cid) mutateRuntime(cid, (rt) => { rt.answerBuffer = value; });
    else answerBufferRef.current = value;
  }
  function readRuntimeAnswerBuffer(explicit = null) {
    const cid = activeRuntimeTargetConvId(explicit);
    if (cid) {
      const rt = getRuntime(cid);
      if (rt) return rt.answerBuffer;
    }
    return answerBufferRef.current;
  }

  // `targetConvId` (optional) lets SSE handlers route their write to the
  // conversation that owns the in-flight stream, even if the user has since
  // switched to a different conversation. When omitted, writes use the stream
  // context (if set) or fall back to the currently-shown conversation.
  function updateWorldTaskState(updater, targetConvId = null) {
    const convId = activeRuntimeTargetConvId(targetConvId);
    if (!convId) {
      // No active conversation context — fall back to legacy single-state path
      // so we don't drop the write (rare, mostly during early bootstrap).
      setWorldTaskState((state) => {
        const next = updater(state);
        worldTaskStateRef.current = next;
        cacheTaskImageAttachments(next);
        return next;
      });
      return;
    }
    mutateRuntime(convId, (rt) => {
      rt.worldTaskState = updater(rt.worldTaskState);
    });
  }

  function cacheTaskImageAttachments(state) {
    const entries = [
      ...Object.values(state?.tasksById || {}),
      state?.pendingTask,
    ].filter(Boolean);
    for (const task of entries) {
      const taskId = task.taskId || task.id;
      const images = Array.isArray(task.imageAttachments) ? task.imageAttachments : [];
      if (taskId && images.length > 0) {
        taskImageAttachmentsRef.current.set(taskId, images.map((image) => ({ ...image })));
      }
    }
  }

  function showToast(kind, message) {
    const nextToast = { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, kind, message };
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(nextToast);
    toastTimerRef.current = setTimeout(() => {
      setToast((current) => (current?.id === nextToast.id ? null : current));
      toastTimerRef.current = null;
    }, 3200);
  }

  function applyConversationSnapshot(detail) {
    if (!detail) return;
    setConversationAttachments(Array.isArray(detail.attachments) ? detail.attachments : []);
    const workspacePath = detail.current_working_dir
      || detail.current_workdir
      || detail.cwd
      || detail.workspace_path
      || window.haish?.homePath
      || null;
    setLocalWorkspace({
      path: workspacePath,
      label: detail.workspace_label || null,
    });
  }

  // Called when the user navigates AWAY from a conversation. Previously this
  // wiped the global refs + busy state — which had the side effect of killing
  // any in-flight stream for the conversation being left. With per-conversation
  // runtimes, leaving is now a pure-display operation: the leaving runtime is
  // preserved (its stream keeps running in the background), we only reset the
  // ambient UI bits that don't belong to any conversation (upload chrome,
  // scene actors). The displayed React state will be re-synced when the new
  // conversation activates via `syncDisplayedRuntime`.
  function detachActiveRunFromCurrentConversation() {
    setUploadState({ active: false, fileName: '' });
    setComposerAttachment(null);
    dropPendingSceneItems();
    resetSceneActors();
  }

  function runtimeTaskFromConversationTask(task) {
    if (!task) return null;
    if (task.taskId) return { ...task };
    if (task.task_id) return taskSummaryToRuntimeTask(task, [], userIdRef.current);
    return null;
  }

  function activateConversationShell(projectId, nextConversationId) {
    if (!nextConversationId || nextConversationId === conversationIdRef.current) return;
    const previousId = conversationIdRef.current;
    if (previousId) flushRuntimeTasksToWorkspace(previousId);
    if (previousId && previousId !== nextConversationId) {
      detachActiveRunFromCurrentConversation();
    }
    conversationIdRef.current = nextConversationId;
    setConversationId(nextConversationId);
    setStoredConversationId(nextConversationId);
    const storedContextUsage = loadStoredContextUsage(nextConversationId);
    setContextUsage(storedContextUsage);
    saveStoredContextUsage(storedContextUsage);

    const project = workspaceState.projects.find((item) => item.id === projectId)
      || findProjectByConversationId(workspaceState, nextConversationId);
    setLocalWorkspace({
      path: project?.workspacePath || window.haish?.homePath || null,
      label: project?.workspaceLabel || project?.name || null,
    });
    setConversationAttachments([]);
    setAgentLive({});

    const existingRuntime = getRuntime(nextConversationId);
    if (existingRuntime) {
      syncDisplayedRuntime(existingRuntime);
      return;
    }

    const conversation = findConversationById(workspaceState, nextConversationId);
    const summaryTasks = (Array.isArray(conversation?.tasks) ? conversation.tasks : [])
      .map(runtimeTaskFromConversationTask)
      .filter(Boolean);
    const taskEntries = summaryTasks
      .map((task) => [task.taskId || task.id, task])
      .filter(([taskId]) => Boolean(taskId));
    const taskOrder = taskEntries.map(([taskId]) => taskId);
    const activeTask = summaryTasks.find(isTaskActuallyActive) || null;
    mutateRuntime(nextConversationId, (rt) => {
      rt.worldTaskState = {
        activeTaskId: activeTask?.taskId || activeTask?.id || null,
        pendingTask: null,
        taskOrder,
        tasksById: Object.fromEntries(taskEntries),
      };
      rt.busy = Boolean(activeTask);
      rt.activeRunId = null;
      rt.activeTaskId = activeTask?.taskId || activeTask?.id || null;
      rt.fetchController = null;
      rt.answerBuffer = '';
      rt.cancelledRunIds = new Set();
      rt.abortRequested = false;
      rt.shellSeeded = true;
    });
  }

  async function activateConversationDetail(detail, { restoreLatest = true, activationSeq = null } = {}) {
    if (!detail?.conversation_id) return;
    // Race model: standalone activates bump the activation seq. Conversation
    // selection passes its existing seq so the immediate shell switch and the
    // later detail hydration share the same stale-response guard.
    const nextActivationSeq = activationSeq || invalidateConversationActivation();
    const isCurrentActivation = () => isConversationActivationCurrent(nextActivationSeq);
    // 切走前先把当前 conversation 的实时 worldTaskState flush 回
    // workspaceState[当前 conversation].tasks。否则切到别的会话后，旧会话
    // sidebar 节点会回退到上一次 activate 时拉到的 detail.tasks 快照，刚跑
    // 完的任务消失，要再切回去触发一次 fetch 才会重新出现。
    //
    // 必须用 conversationIdRef.current 而不是 state.activeConversationId：
    // handleSelectConversation 在 await fetchConversationDetail 之前就已经
    // setWorkspaceState 把 activeConversationId 改成了新会话，等这里 reducer
    // 跑到时 state.activeConversationId 已经等于 detail.conversation_id，会
    // 误触发 early return，flush 永远不发生。conversationIdRef.current 直到
    // 本函数下面第 ~3651 行才会被更新，所以这里读到的还是真正"切走前"的 id。
    const previousIdForFlush = conversationIdRef.current;
    setWorkspaceState((state) => {
      const previousId = previousIdForFlush;
      if (!previousId || previousId === detail.conversation_id) return state;
      const previousRuntime = getRuntime(previousId);
      const snapshot = previousRuntime ? previousRuntime.worldTaskState : worldTaskStateRef.current;
      const currentTasks = snapshot.taskOrder
        .map((taskId) => snapshot.tasksById[taskId])
        .filter(Boolean);
      if (currentTasks.length === 0) return state;
      const now = Date.now();
      return normalizeWorkspaceOrdering({
        ...state,
        projects: state.projects.map((project) => ({
          ...project,
          updatedAt: project.conversations.some((conversation) => conversation.id === previousId)
            ? now
            : project.updatedAt,
          conversations: project.conversations.map((conversation) =>
            conversation.id === previousId
              ? { ...conversation, tasks: currentTasks, updatedAt: now }
              : conversation,
          ),
        })),
      });
    });
    if (!isCurrentActivation()) return;
    const restoredConversationId = detail.conversation_id;
    if (conversationIdRef.current && conversationIdRef.current !== restoredConversationId) {
      detachActiveRunFromCurrentConversation();
    }
    conversationIdRef.current = restoredConversationId;
    const restoredTasks = Array.isArray(detail.tasks) ? detail.tasks : [];
    const messageImageFallbacks = chatImageFallbacksByTaskIdFromMessages(detail.messages, restoredConversationId, userIdRef.current);
    const latestTaskId = detail.last_task_id || (restoredTasks.length ? restoredTasks[restoredTasks.length - 1].task_id : null);
    const latestTask = restoredTasks.find((task) => task.task_id === latestTaskId);
    if (restoreLatest && latestTask) {
      const restoredMode = latestTask.execution_mode === 'bot' ? 'world' : 'chat';
      viewModeRef.current = restoredMode;
      setViewMode(restoredMode);
    }
    const nextContextUsage = mergeContextUsage(
      loadStoredContextUsage(restoredConversationId),
      estimateContextUsageFromConversationDetail(detail)
    );
    setConversationId(restoredConversationId);
    setStoredConversationId(restoredConversationId);
    setContextUsage(nextContextUsage);
    saveStoredContextUsage(nextContextUsage);
    applyConversationSnapshot(detail);
    resetSceneActors();
    setWorkspaceState((state) => workspaceStateWithConversationDetail(state, detail, true));

    // If the conversation we're switching INTO already has a runtime with a
    // live stream, don't blow away its in-flight state — just bring the
    // display up to date with whatever the runtime currently holds. Otherwise
    // (no runtime or a fully-quiescent one) we rebuild the world state from
    // the freshly-fetched detail and seed/refresh the runtime accordingly.
    const incomingRuntime = getRuntime(restoredConversationId);
    const incomingHasInflight = Boolean(
      incomingRuntime
      && !incomingRuntime.shellSeeded
      && (incomingRuntime.busy || incomingRuntime.activeRunId || incomingRuntime.fetchController)
    );

    if (incomingHasInflight) {
      syncDisplayedRuntime(incomingRuntime);
    } else {
      const nextWorldTaskState = {
        activeTaskId: null,
        pendingTask: null,
        taskOrder: sortTaskIdsForRestore(restoredTasks, latestTaskId),
        tasksById: Object.fromEntries(
          restoredTasks.map((task) => [
            task.task_id,
            taskSummaryToRuntimeTask(
              task,
              mergeChatImageRefs(
                taskImageAttachmentsRef.current.get(task.task_id) || [],
                messageImageFallbacks.get(task.task_id) || [],
              ),
              userIdRef.current,
            ),
          ])
        ),
      };
      mutateRuntime(restoredConversationId, (rt) => {
        rt.worldTaskState = nextWorldTaskState;
        rt.busy = false;
        rt.activeRunId = null;
        rt.activeTaskId = null;
        rt.fetchController = null;
        rt.answerBuffer = '';
        rt.cancelledRunIds = new Set();
        rt.abortRequested = false;
        rt.shellSeeded = false;
      });
    }

    if (restoreLatest && restoredTasks.length > 0) {
      try {
        await restoreConversationTaskRuntimes(
          restoredTasks.map((task) => task.task_id),
          latestTaskId,
          isCurrentActivation,
        );
      } catch (error) {
        if (!isCurrentActivation()) return;
        console.error('latest task restore failed', error);
        setAgentLive({});
      }
    } else {
      if (isCurrentActivation()) setAgentLive({});
    }
  }

  async function fetchConversationDetail(nextConversationId, { signal } = {}) {
    const detailResponse = await authFetch(`${API_BASE}/api/conversations/${nextConversationId}`, {
      method: 'GET',
      signal,
    }, { json: false });
    if (!detailResponse.ok) {
      throw new Error(`conversation restore failed: ${detailResponse.status}`);
    }
    return detailResponse.json();
  }

  function ensureTaskForEvent(event, targetConvId = null) {
    const eventConversationId = event.conversation_id || null;
    const ownerConvId = targetConvId || conversationIdRef.current;
    if (eventConversationId && ownerConvId && eventConversationId !== ownerConvId) {
      return null;
    }
    const ownerRuntime = ownerConvId ? getRuntime(ownerConvId) : null;
    const seedActiveTaskId = ownerRuntime
      ? ownerRuntime.activeTaskId || ownerRuntime.worldTaskState.activeTaskId
      : activeTaskIdRef.current || worldTaskStateRef.current.activeTaskId;
    const taskId = event.task_id || seedActiveTaskId;
    if (!taskId) return null;
    if (userCancelledTaskIdsRef.current.has(taskId)) {
      return null;
    }

    updateWorldTaskState((state) => {
      const existingTask = state.tasksById[taskId];
      const pendingTask = state.pendingTask;
      const baseTask = existingTask || buildWorldTaskRecord(event, pendingTask);
      const updatedAt = timestampValue(event.created_at) || timestampValue(event.timestamp) || Date.now();
      return {
        ...state,
        activeTaskId: taskId,
        pendingTask: existingTask ? state.pendingTask : null,
        taskOrder: existingTask ? state.taskOrder : [...state.taskOrder, taskId],
        tasksById: {
          ...state.tasksById,
          [taskId]: {
            ...baseTask,
            taskId: taskId,
            conversationId: event.conversation_id || baseTask.conversationId,
            loopIndex: Math.max(baseTask.loopIndex || 0, event.loop_index || 0),
            activeRole: event.actor || baseTask.activeRole,
            updatedAt,
          },
        },
      };
    }, ownerConvId);

    if (ownerConvId) {
      mutateRuntime(ownerConvId, (rt) => { rt.activeTaskId = taskId; });
    } else {
      activeTaskIdRef.current = taskId;
    }
    return taskId;
  }

  function updateTaskById(taskId, updater, targetConvId = null) {
    if (!taskId) return;
    updateWorldTaskState((state) => {
      const task = state.tasksById[taskId];
      if (!task) return state;
      const expectedConvId = activeRuntimeTargetConvId(targetConvId);
      if (task.conversationId && expectedConvId && task.conversationId !== expectedConvId) {
        return state;
      }
      const rawNextTask = typeof updater === 'function' ? updater(task) : { ...task, ...updater };
      // Terminal status (done/failed/cancelled) is sticky. Late-arriving stream
      // events must not regress a finished task back into running/queued — that's
      // what made the sidebar show a loading spinner for already-cancelled tasks.
      const taskWasTerminal = isTerminalTaskStatus(task.status);
      const nextWouldBeTerminal = isTerminalTaskStatus(rawNextTask?.status);
      const nextTask = taskWasTerminal && !nextWouldBeTerminal
        ? {
            ...rawNextTask,
            status: task.status,
            stage: rawNextTask?.stage || task.stage,
            completedAt: rawNextTask?.completedAt || task.completedAt,
            serverFinished: true,
          }
        : rawNextTask;
      return {
        ...state,
        tasksById: {
          ...state.tasksById,
          [taskId]: {
            ...nextTask,
            updatedAt: Date.now(),
          },
        },
      };
    }, targetConvId);
  }

  function getTaskById(taskId, targetConvId = null) {
    if (!taskId) return null;
    const convId = activeRuntimeTargetConvId(targetConvId);
    const runtime = convId ? getRuntime(convId) : null;
    return runtime?.worldTaskState?.tasksById?.[taskId]
      || worldTaskStateRef.current.tasksById[taskId]
      || null;
  }

  function resolveScenePlaybackContext(event, task = null) {
    const providerMeta = resolveProviderMeta(event, task);
    const actorId = event.actor_id || WORLD_ROLE_TO_ACTOR[event.actor];
    const executorActorId = event.executor_actor_id || executorActorForToolGroup(event.tool_group);
    const sceneKey = sceneKeyForWorldEvent(event, executorActorId);
    const routeConfig = WORLD_EVENT_ROUTE_MAP[sceneKey] || WORLD_EVENT_ROUTE_MAP[event.type];
    const actor = PROVIDER_SCENE_EVENT_TYPES.has(event.type)
      ? providerMeta.actor
      : event.tool_group === 'skill'
        ? providerMeta.actor
      : routeConfig?.actor || actorId;
    return {
      providerMeta,
      actorId,
      executorActorId,
      sceneKey,
      routeConfig,
      actor,
    };
  }

  function buildSceneItem(event, taskId, targetConvId = null) {
    if (!event || !taskId) return null;
    const runtime = sceneRuntimeRef.current;
    runtime.seq += 1;
    const task = getTaskById(taskId, targetConvId);
    const context = resolveScenePlaybackContext(event, task);
    return {
      queueId: `scene-${runtime.seq}`,
      taskId,
      conversationId: targetConvId || event.conversation_id || task?.conversationId || null,
      event,
      eventType: event.type,
      callId: event.call_id || null,
      actor: context.actor || null,
      executorActorId: context.executorActorId || null,
      routeKey: context.routeConfig?.route || '',
      toolName: event.tool_name || '',
      toolGroup: event.tool_group || '',
      keepPolicy: SCENE_CATCHUP_KEEP_TYPES.has(event.type) ? 'required' : 'compressible',
      signature: [
        event.type,
        event.call_id || '',
        context.actor || '',
        context.executorActorId || '',
        event.tool_name || '',
        event.tool_group || '',
        context.routeConfig?.route || '',
      ].join(':'),
    };
  }

  function appendTaskEvent(taskId, event) {
    updateTaskById(taskId, (task) => ({
      ...task,
      loopIndex: Math.max(task.loopIndex || 0, event.loop_index || 0),
      activeRole: event.actor || task.activeRole,
      eventLog: [
        ...task.eventLog,
        worldEventToRuntimeLog(event),
      ],
    }));
  }

  function dropPendingSceneItems(taskId = null) {
    const runtime = sceneRuntimeRef.current;
    if (runtime.pending.length) {
      runtime.pending = taskId
        ? runtime.pending.filter((item) => item.taskId !== taskId)
        : [];
    }
    clearSceneWaitState(taskId);
  }

  function clearSceneWaitState(taskId = null) {
    const runtime = sceneRuntimeRef.current;
    const shouldClear = (key) => !taskId || key.startsWith(`${taskId}:`);
    for (const [key, waiter] of runtime.toolCompletionWaiters.entries()) {
      if (!shouldClear(key)) continue;
      clearTimeout(waiter.timer);
      waiter.resolve(null);
      runtime.toolCompletionWaiters.delete(key);
    }
    for (const [key, waiter] of runtime.thinkingCompletionWaiters.entries()) {
      if (!shouldClear(key)) continue;
      clearTimeout(waiter.timer);
      waiter.resolve(null);
      runtime.thinkingCompletionWaiters.delete(key);
    }
    for (const key of Array.from(runtime.toolCompletions.keys())) {
      if (shouldClear(key)) runtime.toolCompletions.delete(key);
    }
    for (const key of Array.from(runtime.thinkingCompletions.keys())) {
      if (shouldClear(key)) runtime.thinkingCompletions.delete(key);
    }
    stopThinkingPulsesForTask(taskId);
  }

  function sceneToolKey(event, taskId) {
    return `${taskId}:${event.call_id || event.tool_name || event.event_id || 'tool'}`;
  }

  function sceneThinkingKey(event, taskId) {
    return `${taskId}:${event.provider_key || event.provider || 'provider'}:${event.loop_index || 0}`;
  }

  function rememberSceneCompletion(kind, event, taskId) {
    const runtime = sceneRuntimeRef.current;
    const key = kind === 'tool' ? sceneToolKey(event, taskId) : sceneThinkingKey(event, taskId);
    const waiterMap = kind === 'tool' ? runtime.toolCompletionWaiters : runtime.thinkingCompletionWaiters;
    const completionMap = kind === 'tool' ? runtime.toolCompletions : runtime.thinkingCompletions;
    const waiter = waiterMap.get(key);
    if (waiter) {
      clearTimeout(waiter.timer);
      waiterMap.delete(key);
      waiter.resolve(event);
      return;
    }
    completionMap.set(key, event);
  }

  function resolveSceneThinkingWaitersForTask(taskId, event) {
    if (!taskId) return;
    const runtime = sceneRuntimeRef.current;
    for (const [key, waiter] of runtime.thinkingCompletionWaiters.entries()) {
      if (!key.startsWith(`${taskId}:`)) continue;
      if (waiter.timer) clearTimeout(waiter.timer);
      runtime.thinkingCompletionWaiters.delete(key);
      waiter.resolve(event || null);
    }
  }

  function waitForSceneCompletion(kind, event, taskId) {
    const runtime = sceneRuntimeRef.current;
    const key = kind === 'tool' ? sceneToolKey(event, taskId) : sceneThinkingKey(event, taskId);
    const completionMap = kind === 'tool' ? runtime.toolCompletions : runtime.thinkingCompletions;
    const existing = completionMap.get(key);
    if (existing) {
      if (kind === 'tool') completionMap.delete(key);
      return Promise.resolve(existing);
    }
    const waiterMap = kind === 'tool' ? runtime.toolCompletionWaiters : runtime.thinkingCompletionWaiters;
    return new Promise((resolve) => {
      const timer = kind === 'thinking'
        ? null
        : setTimeout(() => {
            waiterMap.delete(key);
            resolve(null);
          }, SCENE_WAIT_TIMEOUT_MS);
      waiterMap.set(key, { resolve, timer });
    });
  }

  function findLastSceneItem(items, predicate) {
    for (let index = items.length - 1; index >= 0; index -= 1) {
      if (predicate(items[index], index)) return items[index];
    }
    return null;
  }

  function compactPendingSceneItems(taskId, targetConvId = null) {
    const runtime = sceneRuntimeRef.current;
    if (!taskId || !runtime.pending.length) return;
    const targetItems = runtime.pending.filter((item) => (
      item.taskId === taskId && (!targetConvId || item.conversationId === targetConvId)
    ));
    if (!targetItems.length) return;

    const keepIds = new Set();
    const lastFinalAnswer = findLastSceneItem(targetItems, (item) => item.eventType === 'llm_final_answer');
    const lastGatewayReported = findLastSceneItem(targetItems, (item) => item.eventType === 'agent_gateway_reported');
    if (lastFinalAnswer) keepIds.add(lastFinalAnswer.queueId);
    if (lastGatewayReported) keepIds.add(lastGatewayReported.queueId);

    const toolGroups = Array.from(new Set(
      targetItems
        .filter((item) => SCENE_CATCHUP_TOOL_EVENT_TYPES.has(item.eventType))
        .map((item) => item.toolGroup)
        .filter(Boolean),
    ));

    for (const toolGroup of toolGroups) {
      const lastToolResultForGroup = findLastSceneItem(
        targetItems,
        (item) => item.toolGroup === toolGroup && item.eventType === 'tool_result_returned',
      );
      const fallbackForGroup = findLastSceneItem(
        targetItems,
        (item) => item.toolGroup === toolGroup && SCENE_CATCHUP_TOOL_EVENT_TYPES.has(item.eventType),
      );
      const keepItem = lastToolResultForGroup || fallbackForGroup;
      if (keepItem) keepIds.add(keepItem.queueId);
    }

    if (!keepIds.size) {
      const fallback = findLastSceneItem(
        targetItems,
        (item) => item.keepPolicy === 'required',
      ) || targetItems[targetItems.length - 1];
      if (fallback) keepIds.add(fallback.queueId);
    }

    const compacted = targetItems.filter((item) => keepIds.has(item.queueId));
    let inserted = false;
    runtime.pending = runtime.pending.flatMap((item) => {
      if (item.taskId !== taskId || (targetConvId && item.conversationId !== targetConvId)) return [item];
      if (inserted) return [];
      inserted = true;
      return compacted;
    });

    updateTaskById(taskId, (task) => ({
      ...task,
      sceneCatchup: true,
    }), targetConvId);
  }

  function markAgentLive(actor, payload) {
    setAgentLive((state) => ({
      ...state,
      [actor]: mergeAgentLiveEntry(state[actor], payload),
    }));
  }

  function stopThinkingPulse(actor) {
    if (!actor) return;
    const runtime = sceneRuntimeRef.current;
    const entry = runtime.thinkingPulseTimers.get(actor);
    if (!entry) return;
    clearInterval(entry.timer);
    runtime.thinkingPulseTimers.delete(actor);
  }

  function stopThinkingPulsesForTask(taskId = null) {
    const runtime = sceneRuntimeRef.current;
    for (const [actor, entry] of runtime.thinkingPulseTimers.entries()) {
      if (!taskId || entry.taskId === taskId) {
        clearInterval(entry.timer);
        runtime.thinkingPulseTimers.delete(actor);
      }
    }
  }

  function startThinkingPulse(actor, {
    taskId,
    baseBubble = 'Reasoning',
    kind = 'llm',
    tag = 'THINKING',
    stepCurrent = 1,
    stepTotal = 1,
  } = {}) {
    if (!actor || !STATIONS[actor]) return;
    stopThinkingPulse(actor);
    const startedAt = Date.now();
    const tick = () => {
      const elapsedMs = Date.now() - startedAt;
      const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
      const dots = '.'.repeat((elapsedSeconds % 3) + 1);
      const bubbleText = `${baseBubble}${dots}`;
      updateNpc(actor, {
        action: { kind, label: tag },
        bubble: bubbleText,
        busy: false,
        thinking: true,
      });
    };
    tick();
    const timer = setInterval(tick, THINKING_PULSE_INTERVAL_MS);
    sceneRuntimeRef.current.thinkingPulseTimers.set(actor, { timer, taskId });
  }

  function setActorIdle(actor) {
    if (!actor || !STATIONS[actor]) return;
    stopThinkingPulse(actor);
    updateNpc(actor, {
      action: null,
      bubble: null,
      busy: false,
      thinking: false,
      walking: false,
      dir: 'front',
    });
  }

  function setActorActive(actor, { kind, bubble = '', thinking = false } = {}) {
    if (!actor || !STATIONS[actor]) return;
    updateNpc(actor, {
      action: {
        kind: kind || WORLD_KIND_MAP[actor] || 'deliver',
        label: bubble ? summarizeText(bubble, 22).toUpperCase() : 'ACTIVE',
      },
      bubble,
      busy: !thinking,
      thinking,
    });
  }

  async function returnActorHome(actor, pathSpec, meta = {}) {
    if (!actor || !STATIONS[actor]) return;
    const path = [...resolvePathSpec(pathSpec), STATIONS[actor]];
    await animateWalk(actor, path, meta);
    setActorIdle(actor);
  }

  function resetSceneActors() {
    for (const actor of Object.keys(STATIONS)) {
      setActorIdle(actor);
    }
  }

  function completeTaskAgents(taskId, outcome = 'done') {
    setAgentLive((state) => {
      const next = { ...state };
      for (const actor of Object.keys(next)) {
        const entries = legacyLiveEntries(next[actor]);
        if (next[actor]?.taskId === taskId || entries.some((entry) => entry.taskId === taskId)) {
          next[actor] = completeAgentLiveEntries(next[actor], taskId, outcome);
        }
      }
      return next;
    });
  }

  function finalizeTaskPresentation(taskId, resultText, targetConvId = null) {
    if (!taskId) return;
    pendingPresentationTaskIdsRef.current.delete(taskId);
    const task = getTaskById(taskId, targetConvId);
    const taskConvId = targetConvId || task?.conversationId || null;
    updateTaskById(taskId, (run) => ({
      ...run,
      status: ['failed', 'cancelled', 'aborted'].includes(run.status) ? normalizeTaskStatus(run.status) : 'done',
      stage: 'done',
      completedAt: run.completedAt || Date.now(),
      answerText: resultText || run.answerText,
      presentationPending: false,
      serverFinished: true,
      sceneCatchup: false,
    }), taskConvId);
    updateWorldTaskState((state) => ({ ...state, activeTaskId: null }), taskConvId);
    setRuntimeBusy(false, taskConvId);
    setRuntimeActiveTaskId(null, taskConvId);
    setRuntimeFetchController(null, taskConvId);
    dropPendingSceneItems(taskId);
    resetSceneActors();
    completeTaskAgents(taskId, 'done');
  }

  function isChatOriginTask(taskId, targetConvId = null) {
    const task = getTaskById(taskId, targetConvId);
    return task?.originViewMode === 'chat';
  }

  function isBotWorkflowTask(taskId, targetConvId = null) {
    return getTaskById(taskId, targetConvId)?.executionMode === 'bot';
  }

  function pumpSceneQueue() {
    const runtime = sceneRuntimeRef.current;
    if (runtime.running) {
      return runtime.currentPromise || Promise.resolve();
    }
    runtime.running = true;
    runtime.currentPromise = (async () => {
      while (runtime.pending.length) {
        const item = runtime.pending.shift();
        if (!item) continue;
        runtime.activeItem = item;
        await playWorldEventScene(item.event, item.taskId, item.conversationId || null);
      }
      runtime.activeItem = null;
      runtime.running = false;
      runtime.currentPromise = null;
    })().catch((error) => {
      runtime.activeItem = null;
      runtime.running = false;
      runtime.currentPromise = null;
      console.error('scene error', error);
    });
    return runtime.currentPromise;
  }

  function enqueueSceneEvent(event, taskId, targetConvId = null) {
    const item = buildSceneItem(event, taskId, targetConvId);
    if (!item) return Promise.resolve();
    sceneRuntimeRef.current.pending.push(item);
    return pumpSceneQueue();
  }

  function scheduleSceneEvent(event, taskId, targetConvId = null) {
    if (event.type === 'llm_thinking_completed') {
      rememberSceneCompletion('thinking', event, taskId);
      return Promise.resolve();
    }
    if (SCENE_TERMINAL_EVENT_TYPES.has(event.type)) {
      resolveSceneThinkingWaitersForTask(taskId, event);
      stopThinkingPulsesForTask(taskId);
    }
    if (event.type === 'tool_executor_completed') {
      rememberSceneCompletion('tool', event, taskId);
      return Promise.resolve();
    }
    return enqueueSceneEvent(event, taskId, targetConvId);
  }

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const distancePx = (from, to) => Math.hypot((to.x - from.x) * MAP_W, (to.y - from.y) * MAP_H);

  function dirFromTo(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'side' : 'side-left';
    return dy > 0 ? 'front' : 'back';
  }

  function walkDirFor(actor, from, to, meta = {}) {
    const dx = to.x - from.x;
    if (meta.preferSideWalk) {
      return dx >= 0 ? 'side' : 'side-left';
    }
    return dirFromTo(from, to);
  }

  function getProviderToToolManagerRoute(actor) {
    if (actor === 'okabe' || actor === 'kurisu') return 'planningToLelouch';
    return null;
  }

  function getToolManagerToProviderRoute(actor) {
    if (actor === 'okabe' || actor === 'kurisu') return 'lelouchToPlanning';
    return null;
  }

  function getExecutorReportRoute(actor) {
    if (actor === 'levi') return 'leviToLelouch';
    if (actor === 'itachi') return 'itachiToLelouch';
    if (actor === 'mikey') return 'mikeyToLelouch';
    return null;
  }

  function getActorReturnMeta(actor) {
    return actor === 'itachi' ? { preferSideWalk: true } : {};
  }

  async function pauseForHandoff(actor, target, delay = 420) {
    orientToward(actor, target);
    orientToward(target, actor);
    await sleep(delay);
  }

  function getProviderToolRequestAction(actor) {
    if (actor === 'okabe') return { kind: 'mcp', label: 'DELEGATE' };
    return { kind: 'deliver', label: 'DELEGATE' };
  }

  function resolvePoint(ref) {
    if (!ref) return null;
    if (typeof ref === 'string') {
      return STATIONS[ref] || NAV_POINTS?.[ref] || MEET_POINTS?.[ref] || null;
    }
    return ref;
  }

  function resolvePathSpec(spec) {
    if (!spec) return [];
    if (Array.isArray(spec)) return spec.flatMap((item) => resolvePathSpec(item));
    if (typeof spec === 'string' && ROUTES?.[spec]) {
      return ROUTES[spec].flatMap((item) => resolvePathSpec(item));
    }
    const point = resolvePoint(spec);
    return point ? [point] : [];
  }

  function orientToward(actor, target) {
    const actorPos = npcStatesRef.current[actor]?.pos;
    const targetPos = typeof target === 'string' && npcStatesRef.current[target]
      ? npcStatesRef.current[target].pos
      : resolvePoint(target);
    if (!actorPos || !targetPos) return;
    updateNpc(actor, { dir: dirFromTo(actorPos, targetPos) });
  }

  function syncNpcPositions(stations) {
    setNpcStates((state) => {
      const next = { ...state };
      for (const id of Object.keys(STATIONS)) {
        const station = stations[id];
        next[id] = {
          ...state[id],
          pos: { x: station.x, y: station.y },
          walking: false,
          action: null,
          bubble: null,
          busy: false,
          thinking: false,
        };
      }
      npcStatesRef.current = next;
      return next;
    });
  }

  function clearAllPoseDebug() {
    setNpcStates((state) => {
      const next = {};
      for (const id of Object.keys(state)) next[id] = { ...state[id], poseDebug: null };
      npcStatesRef.current = next;
      return next;
    });
  }

  function setPoseDebug(id, patch) {
    updateNpc(id, (npc) => ({
      ...npc,
      poseDebug: {
        ...(npc.poseDebug || POSE_DEBUG_DEFAULTS),
        ...patch,
      },
    }));
  }

  function getPoseDebugForMapping(mappingKey) {
    const field = POSE_MAPPING_FIELDS.find((item) => item.key === mappingKey);
    if (!field) return { ...POSE_DEBUG_DEFAULTS };
    if (field.type === 'idle') {
      return { pose: 'idle', dir: field.dir, movement: 'idle' };
    }
    if (field.type === 'walk') {
      return { pose: 'idle', dir: field.dir, movement: 'walking' };
    }
    return { pose: field.key, dir: 'front', movement: 'idle' };
  }

  function syncPosePreview(id, mappingKey) {
    setPoseDebug(id, getPoseDebugForMapping(mappingKey));
  }

  function getCharPoseConfig(id) {
    const def = CHAR_DEFS[id];
    if (!def) return null;
    const base = def.poseConfig || {
      idle: { ...def.idle },
      walk: Object.fromEntries(Object.entries(def.walk).map(([dir, frames]) => [dir, [...frames]])),
      poses: { ...def.poses },
    };
    if (!def.poseConfig) def.poseConfig = base;
    return def.poseConfig;
  }

  function getPoseMappingValue(id, mappingKey) {
    const def = CHAR_DEFS[id];
    const config = getCharPoseConfig(id);
    const field = POSE_MAPPING_FIELDS.find((item) => item.key === mappingKey);
    if (!def || !config || !field) return null;
    if (field.type === 'idle') return config.idle[field.dir];
    if (field.type === 'walk') return config.walk[field.dir]?.[0] ?? def.idle[field.dir] ?? def.idle.front;
    return config.poses[field.key];
  }

  function applyPoseMapping(id, mappingKey, frame) {
    const def = CHAR_DEFS[id];
    const config = getCharPoseConfig(id);
    const field = POSE_MAPPING_FIELDS.find((item) => item.key === mappingKey);
    if (!def || !config || !field || frame == null) return;
    if (field.type === 'idle') {
      config.idle[field.dir] = frame;
      if (!config.walk[field.dir]?.length) config.walk[field.dir] = [frame];
    } else if (field.type === 'walk') {
      const sourceFrames = def.walk[field.dir]?.length ? [...def.walk[field.dir]] : [...(config.walk[field.dir] || [])];
      if (!sourceFrames.length) sourceFrames.push(frame);
      sourceFrames[0] = frame;
      config.walk[field.dir] = sourceFrames;
    } else {
      config.poses[field.key] = frame;
    }
    updateNpc(id, (npc) => ({ ...npc }));
  }

  function getPoseFrameOptions(id) {
    const def = CHAR_DEFS[id];
    const config = getCharPoseConfig(id);
    if (!def || !config) return [];
    const seen = new Set();
    const options = [];
    const pushOption = (frame, label, group, sourceKey) => {
      if (frame == null || seen.has(sourceKey)) return;
      seen.add(sourceKey);
      options.push({ frame, label, group, sourceKey });
    };
    pushOption(config.idle.front, 'Idle Front', 'idle', 'idle_front');
    pushOption(config.idle.side, 'Idle Side', 'idle', 'idle_side');
    pushOption(config.idle.back, 'Idle Back', 'idle', 'idle_back');
    pushOption(config.walk.front?.[0], 'Walk Front', 'walk', 'walk_front');
    pushOption(config.walk.side?.[0], 'Walk Side', 'walk', 'walk_side');
    pushOption(config.walk.back?.[0], 'Walk Back', 'walk', 'walk_back');
    for (const option of POSE_DEBUG_OPTIONS) {
      pushOption(config.poses[option.key], option.label, 'pose', `pose_${option.key}`);
    }
    return options;
  }

  function resetPoseMapping(id) {
    const def = CHAR_DEFS[id];
    if (!def) return;
    def.poseConfig = {
      idle: { ...def.idle },
      walk: Object.fromEntries(Object.entries(def.walk).map(([dir, frames]) => [dir, [...frames]])),
      poses: { ...def.poses },
    };
    updateNpc(id, (npc) => ({ ...npc, poseDebug: null }));
  }

  function getIdsForTarget(target) {
    if (target === 'routes') return [...new Set((ROUTE_EDITOR_DEFS?.[selectedRouteId]?.refs || ROUTES[selectedRouteId] || []))];
    if (target === 'meet') return MEET_POINT_IDS;
    return CALIBRATION_IDS;
  }

  function getDraftsForTarget(target) {
    if (target === 'routes') {
      return Object.fromEntries(
        getIdsForTarget('routes').map((id) => {
          const sourceTarget = resolvePointTarget(id);
          const sourceDrafts = sourceTarget === 'meet' ? meetDrafts : sourceTarget === 'stations' ? stationDrafts : navDrafts;
          return [id, sourceDrafts[id]];
        })
      );
    }
    if (target === 'meet') return meetDrafts;
    return stationDrafts;
  }

  function getSourceMapForTarget(target) {
    if (target === 'nav') return NAV_POINTS;
    if (target === 'meet') return MEET_POINTS;
    return STATIONS;
  }

  function resolvePointTarget(id) {
    if (NAV_POINTS[id]) return 'nav';
    if (MEET_POINTS[id]) return 'meet';
    if (STATIONS[id]) return 'stations';
    return null;
  }

  function getFirstRouteRef(routeId) {
    const route = ROUTE_EDITOR_DEFS?.[routeId]?.refs || ROUTES[routeId] || [];
    return route[0] || null;
  }

  function getPointDisplayName(target, id) {
    if (target === 'stations') return CHAR_DEFS[id]?.name || id;
    if (target === 'routes') {
      const sourceTarget = resolvePointTarget(id);
      if (sourceTarget === 'meet') return `${id} · report point`;
      if (sourceTarget === 'stations') return `${CHAR_DEFS[id]?.name || id} · station`;
      return `${id} · waypoint`;
    }
    return id;
  }

  function setPointPosition(target, id, pos) {
    if (target === 'routes') {
      const routeTarget = resolvePointTarget(id);
      if (!routeTarget) return;
      setPointPosition(routeTarget, id, pos);
      return;
    }
    const source = getSourceMapForTarget(target);
    const current = source[id];
    if (!current) return;
    const nextPoint = { ...current, x: roundCoord(clamp01(pos.x)), y: roundCoord(clamp01(pos.y)) };
    source[id] = nextPoint;
    if (target === 'stations') {
      setStationDrafts((drafts) => ({ ...drafts, [id]: nextPoint }));
      updateNpc(id, (npc) => ({ ...npc, pos: { x: nextPoint.x, y: nextPoint.y }, walking: false, action: null, bubble: null, busy: false, thinking: false }));
    } else if (target === 'nav') {
      setNavDrafts((drafts) => ({ ...drafts, [id]: nextPoint }));
    } else {
      setMeetDrafts((drafts) => ({ ...drafts, [id]: nextPoint }));
    }
  }

  function stagePointFromClient(clientX, clientY) {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect?.width || !rect?.height) return null;
    return { x: clamp01((clientX - rect.left) / rect.width), y: clamp01((clientY - rect.top) / rect.height) };
  }

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

  function handleMarkerPointerDown(target, id, event) {
    if (!worldCalibrationActive || busy) return;
    event.preventDefault(); event.stopPropagation();
    const point = stagePointFromClient(event.clientX, event.clientY);
    if (!point) return;
    const resolvedTarget = target === 'routes' ? resolvePointTarget(id) : target;
    const source = getSourceMapForTarget(resolvedTarget);
    const current = resolvedTarget === 'stations' ? (npcStatesRef.current[id]?.pos || source[id]) : source[id];
    setCalibrationTarget(target);
    setSelectedMarkerId(id);
    dragStateRef.current = { target, id, offsetX: point.x * MAP_W - current.x * MAP_W, offsetY: point.y * MAP_H - current.y * MAP_H };
  }

  function prepareWorldCalibration() {
    dragStateRef.current = null;
    const stationSnapshot = clonePointMap(STATIONS);
    setStationDrafts(stationSnapshot);
    setNavDrafts(clonePointMap(NAV_POINTS));
    setMeetDrafts(clonePointMap(MEET_POINTS));
    syncNpcPositions(stationSnapshot);
    clearAllPoseDebug();
    setCopiedCoords(false);
  }

  function handleSettingsSectionChange(section) {
    setSettingsSection(section);
    if (section === 'world') prepareWorldCalibration();
    else {
      dragStateRef.current = null;
      clearAllPoseDebug();
    }
  }

  function handleToggleCalibration() {
    if (busy) return;
    if (activeTab !== 'dashboard') setActiveTab('dashboard');
    dragStateRef.current = null;
    setCalibrationMode((enabled) => {
      const next = !enabled;
      if (next) setSettingsSection('llm');
      else clearAllPoseDebug();
      return next;
    });
    setCopiedCoords(false);
  }

  async function handleSaveSettingsDraft() {
    try {
      window.localStorage?.setItem(LLM_SETTINGS_STORAGE_KEY, JSON.stringify(llmSettingsDraft));
      window.localStorage?.setItem(SETTINGS_RECORDS_STORAGE_KEY, JSON.stringify(settingsRecordsDraft));
      const llmResponse = await authFetch(`${API_BASE}/api/settings/llm`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(llmSettingsDraft),
      }, { json: false });
      if (!llmResponse.ok) {
        const message = await parseResponseMessage(llmResponse, `llm settings save failed: ${llmResponse.status}`);
        throw new Error(message);
      }
      const llmPayload = await llmResponse.json();
      setLlmSettingsDraft((prev) => applyLlmSettingsPayloadToDraft(prev, llmPayload));
      const toolsPayload = buildToolsSettingsPayload(settingsRecordsDraft);
      const response = await authFetch(`${API_BASE}/api/settings/tools`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toolsPayload),
      }, { json: false });
      if (!response.ok) {
        const message = await parseResponseMessage(response, `settings save failed: ${response.status}`);
        throw new Error(message);
      }
      const payload = await response.json();
      setSettingsRecordsDraft((prev) => applyToolsSettingsPayloadToRecords(prev, payload));
      const memoryResponse = await authFetch(`${API_BASE}/api/settings/memory`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildMemorySettingsPayload(settingsRecordsDraft)),
      }, { json: false });
      if (!memoryResponse.ok) {
        const message = await parseResponseMessage(memoryResponse, `memory settings save failed: ${memoryResponse.status}`);
        throw new Error(message);
      }
      const memoryPayload = await memoryResponse.json();
      setSettingsRecordsDraft((prev) => {
        const next = applyMemorySettingsPayloadToRecords(prev, memoryPayload);
        syncSettingsConnectionStatus(next);
        return next;
      });
      const knowledgeResponse = await authFetch(`${API_BASE}/api/settings/knowledge`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildKnowledgeSettingsPayload(settingsRecordsDraft)),
      }, { json: false });
      if (!knowledgeResponse.ok) {
        const message = await parseResponseMessage(knowledgeResponse, `knowledge settings save failed: ${knowledgeResponse.status}`);
        throw new Error(message);
      }
      const knowledgePayload = await knowledgeResponse.json();
      setSettingsRecordsDraft((prev) => {
        const next = applyKnowledgeSettingsPayloadToRecords(prev, knowledgePayload);
        syncSettingsConnectionStatus(next);
        return next;
      });
      showToast('success', 'settings saved');
    } catch (error) {
      showToast('error', String(error?.message || error));
    }
  }

  async function handleSaveToolsSettingsDraft(nextRecords = settingsRecordsDraft, successMessage = 'settings saved') {
    try {
      window.localStorage?.setItem(SETTINGS_RECORDS_STORAGE_KEY, JSON.stringify(nextRecords));
      const toolsPayload = buildToolsSettingsPayload(nextRecords);
      const response = await authFetch(`${API_BASE}/api/settings/tools`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toolsPayload),
      }, { json: false });
      if (!response.ok) {
        const message = await parseResponseMessage(response, `settings save failed: ${response.status}`);
        throw new Error(message);
      }
      const payload = await response.json();
      setSettingsRecordsDraft((prev) => applyToolsSettingsPayloadToRecords(prev, payload));
      if (successMessage) showToast('success', successMessage);
      return true;
    } catch (error) {
      showToast('error', String(error?.message || error));
      return false;
    }
  }

  function applyAgentSettingsPayload(payload) {
    const normalized = normalizeAgentSettings(payload);
    setAgentSettingsDraft(normalized);
    setAgentCatalog(agentCatalogFromSettings(normalized));
    return normalized;
  }

  async function fetchAgentSettingsPayload() {
    const response = await authFetch(`${API_BASE}/api/settings/agents`, { method: 'GET' }, { json: false });
    if (!response.ok) {
      const message = await parseResponseMessage(response, `agent settings fetch failed: ${response.status}`);
      throw new Error(message);
    }
    return response.json();
  }

  function customAgentPayload(agentId) {
    const current = normalizeAgentSettings(agentSettingsDraft).custom.find((item) => item.agent_id === agentId);
    if (!current) return null;
    const displayName = String(current.display_name || '').trim();
    if (!displayName) throw new Error('agent name is required');
    return {
      id: current.agent_id,
      base: current.base || 'preset.general',
      display_name: displayName,
      description: current.description || '',
      enabled: current.enabled !== false,
      system_prompt: current.system_prompt || '',
      tool_policy: {
        allow: withAlwaysAllowedAgentTools(current.tool_policy?.allow),
        deny: Array.isArray(current.tool_policy?.deny) ? current.tool_policy.deny : [],
      },
      mcp_policy: {
        allow_servers: Array.isArray(current.mcp_policy?.allow_servers) ? current.mcp_policy.allow_servers : [],
        allow_tools: Array.isArray(current.mcp_policy?.allow_tools) ? current.mcp_policy.allow_tools : [],
      },
      skill_policy: {
        allow: Array.isArray(current.skill_policy?.allow) ? current.skill_policy.allow : [],
        deny: Array.isArray(current.skill_policy?.deny) ? current.skill_policy.deny : [],
      },
    };
  }

  async function handleTogglePresetAgent(agentId, enabled) {
    try {
      const response = await authFetch(`${API_BASE}/api/settings/agents/presets/${encodeURIComponent(agentId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      }, { json: false });
      if (!response.ok) {
        const message = await parseResponseMessage(response, `agent settings save failed: ${response.status}`);
        throw new Error(message);
      }
      applyAgentSettingsPayload(await response.json());
      showToast('success', 'agent settings saved');
      return true;
    } catch (error) {
      showToast('error', String(error?.message || error));
      return false;
    }
  }

  async function handleCreateCustomAgent() {
    const draft = createDefaultCustomAgentPayload(agentSettingsDraft);
    setAgentSettingsDraft((prev) => {
      const normalized = normalizeAgentSettings(prev);
      return { ...normalized, custom: [...normalized.custom, draft] };
    });
    return draft.id;
  }

  async function handleSaveCustomAgent(agentId) {
    try {
      const payload = customAgentPayload(agentId);
      if (!payload) throw new Error('custom agent not found');
      const current = normalizeAgentSettings(agentSettingsDraft).custom.find((item) => item.agent_id === agentId);
      const isDraft = Boolean(current?.draft);
      const endpoint = isDraft
        ? `${API_BASE}/api/settings/agents/custom`
        : `${API_BASE}/api/settings/agents/custom/${encodeURIComponent(agentId)}`;
      const response = await authFetch(endpoint, {
        method: isDraft ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }, { json: false });
      if (!response.ok) {
        const message = await parseResponseMessage(response, `agent save failed: ${response.status}`);
        throw new Error(message);
      }
      applyAgentSettingsPayload(await response.json());
      showToast('success', 'custom agent saved');
      return true;
    } catch (error) {
      showToast('error', String(error?.message || error));
      return false;
    }
  }

  async function handleDeleteCustomAgent(agentId) {
    try {
      const current = normalizeAgentSettings(agentSettingsDraft).custom.find((item) => item.agent_id === agentId);
      if (current?.draft) {
        setAgentSettingsDraft((prev) => {
          const normalized = normalizeAgentSettings(prev);
          return {
            ...normalized,
            custom: normalized.custom.filter((item) => item.agent_id !== agentId),
          };
        });
        return true;
      }
      const response = await authFetch(`${API_BASE}/api/settings/agents/custom/${encodeURIComponent(agentId)}`, {
        method: 'DELETE',
      }, { json: false });
      if (!response.ok) {
        const message = await parseResponseMessage(response, `agent delete failed: ${response.status}`);
        throw new Error(message);
      }
      applyAgentSettingsPayload(await response.json());
      showToast('success', 'custom agent deleted');
      return true;
    } catch (error) {
      showToast('error', String(error?.message || error));
      return false;
    }
  }

  function applyWorkflowSettingsPayload(payload) {
    const normalized = normalizeWorkflowSettings(payload);
    setWorkflowSettingsDraft(normalized);
    return normalized;
  }

  async function fetchWorkflowSettingsPayload() {
    const response = await authFetch(`${API_BASE}/api/settings/workflows`, { method: 'GET' }, { json: false });
    if (!response.ok) {
      const message = await parseResponseMessage(response, `workflow settings fetch failed: ${response.status}`);
      throw new Error(message);
    }
    return response.json();
  }

  async function handleTogglePresetWorkflow(workflowId, enabled) {
    try {
      const response = await authFetch(`${API_BASE}/api/settings/workflows/presets/${encodeURIComponent(workflowId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      }, { json: false });
      if (!response.ok) {
        const message = await parseResponseMessage(response, `workflow settings save failed: ${response.status}`);
        throw new Error(message);
      }
      applyWorkflowSettingsPayload(await response.json());
      showToast('success', 'workflow settings saved');
      return true;
    } catch (error) {
      showToast('error', String(error?.message || error));
      return false;
    }
  }

  async function handleCreateCustomWorkflow() {
    const draft = createDefaultCustomWorkflowPayload();
    setWorkflowSettingsDraft((prev) => {
      const normalized = normalizeWorkflowSettings(prev);
      return { ...normalized, custom: [...normalized.custom, draft] };
    });
    return draft.workflow_id;
  }

  async function handleSaveCustomWorkflow(workflowId) {
    try {
      const current = workflowById(workflowSettingsDraft, workflowId);
      if (!current) throw new Error('custom workflow not found');
      const payload = payloadForCustomWorkflow(current);
      const isDraft = Boolean(current.draft);
      const endpoint = isDraft
        ? `${API_BASE}/api/settings/workflows/custom`
        : `${API_BASE}/api/settings/workflows/custom/${encodeURIComponent(workflowId)}`;
      const response = await authFetch(endpoint, {
        method: isDraft ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }, { json: false });
      if (!response.ok) {
        const message = await parseResponseMessage(response, `workflow save failed: ${response.status}`);
        throw new Error(message);
      }
      applyWorkflowSettingsPayload(await response.json());
      showToast('success', 'custom workflow saved');
      return true;
    } catch (error) {
      showToast('error', String(error?.message || error));
      return false;
    }
  }

  async function handleDeleteCustomWorkflow(workflowId) {
    try {
      const current = workflowById(workflowSettingsDraft, workflowId);
      if (current?.draft) {
        setWorkflowSettingsDraft((prev) => {
          const normalized = normalizeWorkflowSettings(prev);
          return {
            ...normalized,
            custom: normalized.custom.filter((item) => item.workflow_id !== workflowId),
          };
        });
        return true;
      }
      const response = await authFetch(`${API_BASE}/api/settings/workflows/custom/${encodeURIComponent(workflowId)}`, {
        method: 'DELETE',
      }, { json: false });
      if (!response.ok) {
        const message = await parseResponseMessage(response, `workflow delete failed: ${response.status}`);
        throw new Error(message);
      }
      applyWorkflowSettingsPayload(await response.json());
      showToast('success', 'custom workflow deleted');
      return true;
    } catch (error) {
      showToast('error', String(error?.message || error));
      return false;
    }
  }

  async function handleTestLlmConfig(selectedId) {
    const config = getSelectedLlmConfig(llmSettingsDraft, selectedId);
    if (!config?.provider) return;
    try {
      const response = await authFetch(`${API_BASE}/api/llm/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(llmProviderRequestPayload(config, {
          includeSecret: true,
          includeOAuth: true,
          refresh: true,
        })),
      }, { json: false });
      if (!response.ok) {
        const message = await parseResponseMessage(response, `llm test failed: ${response.status}`);
        throw new Error(message);
      }
      const payload = await response.json();
      const models = Array.isArray(payload.models) ? payload.models : [];
      const defaultModel = String(payload.default_model || models[0]?.id || '').trim();
      updateSelectedLlmConfig(setLlmSettingsDraft, selectedId, {
        model_options: models,
        ...(config.model ? {} : (defaultModel ? { model: defaultModel } : {})),
        ...(config.auth_mode === 'oauth' ? {
          oauth_configured: true,
          ...(payload.oauth_saved ? { oauth_code: '' } : {}),
        } : {}),
      });
      showToast('success', 'llm provider test passed');
    } catch (error) {
      showToast('error', String(error?.message || error));
    }
  }

  async function handleTestWebProvider(provider, apiKey = '') {
    const providerLabel = WEB_SEARCH_PROVIDER_OPTIONS.find((item) => item.id === provider)?.label || provider;
    try {
      const trimmed = String(apiKey || '').trim();
      const response = await authFetch(`${API_BASE}/api/settings/tools/web-search/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          ...(trimmed ? { api_key: trimmed } : {}),
        }),
      }, { json: false });
      if (!response.ok) {
        const message = await parseResponseMessage(response, `web search provider test failed: ${response.status}`);
        throw new Error(message);
      }
      await response.json();
      showToast('success', `${providerLabel} API key test passed`);
      return true;
    } catch (error) {
      showToast('error', String(error?.message || error));
      return false;
    }
  }

  function handleSettingsConnectionDirty(section, itemId) {
    if (!['memory', 'knowledge'].includes(section) || !itemId) return;
    updateSettingsConnectionStatus((prev) => {
      const current = prev?.[section]?.[itemId];
      if (!current || current.state === 'idle') return prev;
      return {
        ...prev,
        [section]: {
          ...(prev?.[section] || {}),
          [itemId]: { state: 'idle', message: '' },
        },
      };
    });
  }

  async function handleTestSettingsConnection(section, itemId) {
    if (!['memory', 'knowledge'].includes(section) || !itemId) return false;
    const label = section === 'memory' ? 'Neo4j' : 'Qdrant';
    const payload = section === 'memory'
      ? buildMemorySettingsPayload(settingsRecordsDraft)
      : buildKnowledgeSettingsPayload(settingsRecordsDraft);
    const signature = settingsConnectionSignatureFor(settingsRecordsDraft, section, itemId);
    updateSettingsConnectionStatus((prev) => ({
      ...prev,
      [section]: {
        ...(prev?.[section] || {}),
        [itemId]: { state: 'testing', message: '', signature },
      },
    }));
    try {
      const response = await authFetch(`${API_BASE}/api/settings/${section}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }, { json: false });
      if (!response.ok) {
        const message = await parseResponseMessage(response, `${label} connection test failed: ${response.status}`);
        throw new Error(message);
      }
      const result = await response.json();
      const message = String(result?.message || `${label} connection verified.`);
      updateSettingsConnectionStatus((prev) => {
        const current = prev?.[section]?.[itemId];
        if (current?.state !== 'testing' || current?.signature !== signature) return prev;
        return {
          ...prev,
          [section]: {
            ...(prev?.[section] || {}),
            [itemId]: { state: 'success', message, signature },
          },
        };
      });
      showToast('success', message);
      return true;
    } catch (error) {
      const message = String(error?.message || error);
      updateSettingsConnectionStatus((prev) => {
        const current = prev?.[section]?.[itemId];
        if (current?.state !== 'testing' || current?.signature !== signature) return prev;
        return {
          ...prev,
          [section]: {
            ...(prev?.[section] || {}),
            [itemId]: { state: 'error', message, signature },
          },
        };
      });
      showToast('error', message);
      return false;
    }
  }

  async function handleInstallSkillDirectory() {
    try {
      let sourcePath = '';
      if (window.haish?.pickSkillDirectory) {
        const result = await window.haish.pickSkillDirectory();
        if (result?.canceled) return;
        sourcePath = result?.path || '';
      } else {
        sourcePath = String(window.prompt?.('Skill directory path') || '').trim();
      }
      if (!sourcePath) return;
      setSkillActionBusy('install');
      const response = await authFetch(`${API_BASE}/api/settings/tools/skills/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: sourcePath }),
      }, { json: false });
      if (!response.ok) {
        const message = await parseResponseMessage(response, `skill install failed: ${response.status}`);
        throw new Error(message);
      }
      const payload = await response.json();
      setSettingsRecordsDraft((prev) => applyToolsSettingsPayloadToRecords(prev, payload));
      showToast('success', 'skill installed');
    } catch (error) {
      showToast('error', String(error?.message || error));
    } finally {
      setSkillActionBusy('');
    }
  }

  async function handleToggleSkill(name, enabled) {
    if (!name) return;
    try {
      setSkillActionBusy(name);
      const response = await authFetch(`${API_BASE}/api/settings/tools/skills/${encodeURIComponent(name)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      }, { json: false });
      if (!response.ok) {
        const message = await parseResponseMessage(response, `skill update failed: ${response.status}`);
        throw new Error(message);
      }
      const payload = await response.json();
      setSettingsRecordsDraft((prev) => applyToolsSettingsPayloadToRecords(prev, payload));
      showToast('success', enabled ? 'skill enabled' : 'skill disabled');
    } catch (error) {
      showToast('error', String(error?.message || error));
    } finally {
      setSkillActionBusy('');
    }
  }

  async function handleUninstallSkill(name) {
    if (!name) return;
    try {
      setSkillActionBusy(name);
      const response = await authFetch(`${API_BASE}/api/settings/tools/skills/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      }, { json: false });
      if (!response.ok) {
        const message = await parseResponseMessage(response, `skill uninstall failed: ${response.status}`);
        throw new Error(message);
      }
      const payload = await response.json();
      setSettingsRecordsDraft((prev) => applyToolsSettingsPayloadToRecords(prev, payload));
      showToast('success', 'skill uninstalled');
    } catch (error) {
      showToast('error', String(error?.message || error));
    } finally {
      setSkillActionBusy('');
    }
  }

  function handleResetCalibration() {
    if (busy) return;
    if (calibrationTarget === 'poses') {
      for (const id of CALIBRATION_IDS) resetPoseMapping(id);
      clearAllPoseDebug();
      setCopiedCoords(false);
      return;
    }
    const ids = getIdsForTarget(calibrationTarget);
    const restored = calibrationTarget === 'routes' ? null : calibrationTarget === 'nav' ? clonePointMap(originalNavRef.current) : calibrationTarget === 'meet' ? clonePointMap(originalMeetRef.current) : clonePointMap(originalStationsRef.current);
    if (calibrationTarget === 'routes') {
      for (const id of ids) {
        const rt = resolvePointTarget(id);
        if (rt === 'meet') MEET_POINTS[id] = { ...originalMeetRef.current[id] };
        else if (rt === 'stations') STATIONS[id] = { ...originalStationsRef.current[id] };
        else NAV_POINTS[id] = { ...originalNavRef.current[id] };
      }
      setNavDrafts(clonePointMap(NAV_POINTS)); setMeetDrafts(clonePointMap(MEET_POINTS)); setStationDrafts(clonePointMap(STATIONS));
      syncNpcPositions(STATIONS);
    } else {
      const tm = getSourceMapForTarget(calibrationTarget);
      for (const id of ids) tm[id] = restored[id];
      if (calibrationTarget === 'nav') setNavDrafts(restored);
      else if (calibrationTarget === 'meet') setMeetDrafts(restored);
      else { setStationDrafts(restored); syncNpcPositions(restored); }
    }
    setCopiedCoords(false);
  }

  async function animateWalk(actor, points, meta = {}) {
    const path = points.flatMap(p => resolvePathSpec(p));
    if (!path.length) return npcStatesRef.current[actor].pos;
    updateNpc(actor, c => ({ ...c, walking: true, dir: walkDirFor(actor, c.pos, path[0], meta), ...meta }));
    for (const target of path) {
      const from = npcStatesRef.current[actor].pos;
      const walkSpeed = WALK_SPEED_BY_ACTOR[actor] || DEFAULT_WALK_SPEED_PX_PER_SEC;
      const minDuration = WALK_MIN_DURATION_BY_ACTOR[actor] || DEFAULT_WALK_MIN_DURATION_MS;
      const duration = Math.max(minDuration, (distancePx(from, target) / walkSpeed) * 1000);
      await new Promise(r => {
        const start = performance.now();
        const tick = (nowT) => {
          const progress = Math.min(1, (nowT - start) / duration);
          const pos = { x: from.x + (target.x - from.x) * progress, y: from.y + (target.y - from.y) * progress };
          updateNpc(actor, { pos, dir: walkDirFor(actor, pos, target, meta), walking: progress < 1, ...meta });
          if (progress < 1) requestAnimationFrame(tick); else r();
        };
        requestAnimationFrame(tick);
      });
    }
    updateNpc(actor, { pos: path[path.length - 1], walking: false, ...meta });
    return path[path.length - 1];
  }

  async function runStep(step, ctx) {
    const actor = step.actor;
    const action = { kind: step.kind, label: step.label, variant: step.poseVariant || null };
    const travelPoints = [...resolvePathSpec(step.route), ...resolvePathSpec(step.path), ...resolvePathSpec(step.moveTo)];
    const tot = ctx.agentTotals[actor] || 1;
    ctx.agentSteps[actor] = (ctx.agentSteps[actor] || 0) + 1;
    const cur = ctx.agentSteps[actor];

    markAgentLive(actor, { taskId: ctx.taskId, description: step.bubble || step.log?.msg || '', stepCurrent: cur, stepTotal: tot, tag: step.label, kind: step.kind, status: 'pending' });
    if (step.questStage) {
      updateTaskById(ctx.taskId, (run) => ({
        ...run,
        stage: step.questStage,
        completedAt: step.questStage === 'done' ? Date.now() : run.completedAt,
      }));
    }
    if (travelPoints.length) {
      await animateWalk(actor, travelPoints, { action, bubble: step.bubbleAfterMove ? null : step.bubble, busy: true, thinking: step.kind === 'think' });
    } else {
      updateNpc(actor, { action, bubble: step.bubble, busy: true, thinking: step.kind === 'think' });
    }
    if (travelPoints.length && step.bubbleAfterMove && step.bubble) {
      updateNpc(actor, { action, bubble: step.bubble, busy: true, thinking: step.kind === 'think' });
    }
    if (step.faceToFaceWith) { orientToward(actor, step.faceToFaceWith); orientToward(step.faceToFaceWith, actor); }
    if (step.forceDir) updateNpc(actor, { dir: step.forceDir });
    if (step.fx || step.kind === 'llm') pushBurst(npcStatesRef.current[actor].pos, KIND_COLORS[step.kind]);
    await sleep(step.duration || 1200);
    updateNpc(actor, { action: null, bubble: null, busy: false, thinking: false });
    if (step.faceToFaceWith) updateNpc(step.faceToFaceWith, { dir: 'front' });
    if (travelPoints.length && step.returnHome !== false) {
      const rp = [ ...(step.returnRoute ? resolvePathSpec(step.returnRoute) : travelPoints.slice(0, -1).reverse()), STATIONS[actor] ];
      const returnMeta = actor === 'itachi' && step.kind === 'report' ? { preferSideWalk: true } : {};
      await sleep(120); await animateWalk(actor, rp, returnMeta); updateNpc(actor, { dir: 'front', walking: false });
    }
  }

  async function playWorkflowEventScene(event, taskId, run, targetConvId = null) {
    if (!WORKFLOW_SCENE_EVENT_TYPES.has(event.type)) return;
    const bindings = workflowNodeActorBindings(run?.workflowSnapshot);
    const byNodeId = new Map(bindings.map((binding) => [binding.nodeId, binding]));
    const nodeId = event.workflow_node_id || event.node_id;
    const node = byNodeId.get(nodeId);
    const nodeKind = node?.type === 'tool' ? 'tool' : node?.type === 'llm' ? 'llm' : node?.type === 'output' ? 'report' : 'think';
    const markWorkflowLive = (binding, description, tag, kind = nodeKind, status = 'pending') => {
      if (!binding) return;
      markAgentLive(binding.actor, {
        taskId,
        description,
        stepCurrent: 1,
        stepTotal: 1,
        tag,
        kind,
        status,
      });
    };

    if (event.type === 'workflow_started') {
      const start = bindings.find((binding) => binding.type === 'start');
      if (!start) return;
      markWorkflowLive(start, 'Workflow started. Preparing the task.', 'START', 'think');
      setActorActive(start.actor, { kind: 'think', bubble: 'Workflow started. Preparing the task.', thinking: true });
      return;
    }

    if (event.type === 'workflow_edge_selected') {
      const incomingEdge = run?.workflowSnapshot?.edges?.find((edge) => (
        (edge.to || edge.target) === event.from_node_id
      ));
      const incomingSourceId = incomingEdge?.from || incomingEdge?.source;
      const source = byNodeId.get(event.from_node_id) || byNodeId.get(incomingSourceId);
      const target = byNodeId.get(event.to_node_id);
      if (!source || !target) return;
      const handoff = `${source.label} handed the task to ${target.label}.`;
      markWorkflowLive(source, handoff, 'HANDOFF', 'deliver', 'done');
      markWorkflowLive(target, 'Task received.', 'RECEIVED', 'think');
      setActorActive(source.actor, { kind: 'deliver', bubble: handoff });
      setActorActive(target.actor, { kind: 'think', bubble: 'Task received.', thinking: true });
      orientToward(source.actor, target.actor);
      orientToward(target.actor, source.actor);
      pushBurst(npcStatesRef.current[source.actor]?.pos || STATIONS[source.actor], KIND_COLORS?.deliver || '#efbf64');
      pushBurst(npcStatesRef.current[target.actor]?.pos || STATIONS[target.actor], KIND_COLORS?.think || '#efbf64');
      await sleep(440);
      setActorIdle(source.actor);
      updateNpc(target.actor, { dir: 'front' });
      return;
    }

    if (event.type === 'workflow_node_started') {
      if (!node) return;
      const bubble = node.type === 'start' ? 'Task ready. Delegating now.' : `${node.label} is working.`;
      markWorkflowLive(node, bubble, 'RUNNING', nodeKind);
      setActorActive(node.actor, { kind: nodeKind, bubble, thinking: nodeKind === 'think' || nodeKind === 'llm' });
      if (nodeKind === 'tool' || nodeKind === 'llm') {
        pushBurst(npcStatesRef.current[node.actor]?.pos || STATIONS[node.actor], KIND_COLORS?.[nodeKind] || '#efbf64');
      }
      return;
    }

    if (event.type === 'workflow_node_finished') {
      if (!node) return;
      const failed = event.success === false || event.status === 'failed';
      const bubble = failed ? `${node.label} failed.` : `${node.label} completed.`;
      markWorkflowLive(node, bubble, failed ? 'FAILED' : 'DONE', failed ? 'report' : nodeKind, failed ? 'failed' : 'done');
      setActorActive(node.actor, { kind: failed ? 'report' : nodeKind, bubble });
      await sleep(340);
      setActorIdle(node.actor);
      return;
    }

    if (event.type === 'workflow_finished' || event.type === 'workflow_failed') {
      const end = bindings.find((binding) => binding.type === 'output');
      if (!end) return;
      const failed = event.type === 'workflow_failed';
      const bubble = failed ? 'Workflow failed. Reporting the blocker.' : 'Final report ready.';
      markWorkflowLive(end, bubble, failed ? 'FAILED' : 'REPORT', 'report', failed ? 'failed' : 'done');
      setActorActive(end.actor, { kind: 'report', bubble });
      pushBurst(npcStatesRef.current[end.actor]?.pos || STATIONS[end.actor], KIND_COLORS?.report || '#efbf64');
      await sleep(640);
      setActorIdle(end.actor);
      const finalTask = getTaskById(taskId, targetConvId);
      const result = toDisplayText(event.output || event.summary || finalTask?.answerText || finalTask?.error || bubble);
      if (!targetConvId || targetConvId === conversationIdRef.current) {
        setHollow({
          title: finalTask?.title || 'Final Report',
          result,
          taskId,
        });
      }
      finalizeTaskPresentation(taskId, result, targetConvId);
    }
  }

  async function playWorldEventScene(event, taskId, targetConvId = null) {
    if (!taskId) return;
    const run = getTaskById(taskId, targetConvId);
    if (run?.executionMode === 'bot') {
      await playWorkflowEventScene(event, taskId, run, targetConvId);
      return;
    }
    const providerMeta = resolveProviderMeta(event, run);
    const actorId = event.actor_id || WORLD_ROLE_TO_ACTOR[event.actor];
    const targetActorId = event.target_actor_id || WORLD_ROLE_TO_ACTOR[event.target];
    const executorActorId = event.executor_actor_id || executorActorForToolGroup(event.tool_group);
    const sceneKey = sceneKeyForWorldEvent(event, executorActorId);
    const routeConfig = WORLD_EVENT_ROUTE_MAP[sceneKey] || WORLD_EVENT_ROUTE_MAP[event.type];
    const actor = PROVIDER_SCENE_EVENT_TYPES.has(event.type)
      ? providerMeta.actor
      : routeConfig?.actor || actorId;
    if (!actor || !STATIONS[actor]) return;

    const bubble = event.type === 'provider_selected'
      ? providerMeta.label
      : event.message || event.data?.message || event.payload?.message || event.delta || routeConfig?.bubble || '';
    const kind = event.kind || routeConfig?.kind || WORLD_KIND_MAP[actor] || 'deliver';
    const action = { kind, label: getWorldEventTag(event.type, kind) };
    const markSceneLive = (liveActor, description, tag = action.label, liveKind = kind, liveStatus = getLiveEventStatus(event.type)) => {
      markAgentLive(liveActor, {
        taskId,
        description: summarizeText(description || bubble || event.content || event.tool_name || event.type),
        stepCurrent: Math.max(1, event.loop_index || 1),
        stepTotal: Math.max(1, event.loop_index || 1),
        tag,
        kind: liveKind,
        status: liveStatus,
      });
    };

    if (kind === 'llm' || kind === 'tool' || kind === 'mcp' || kind === 'skill') {
      pushBurst(npcStatesRef.current[actor]?.pos || STATIONS[actor], KIND_COLORS?.[kind] || '#efbf64');
    }

    if (event.type === 'user_message_received') {
      markSceneLive('gojo', bubble || 'Task submitted.', 'RECEIVED', 'deliver');
      const route = resolvePathSpec('gojoToGuts');
      await animateWalk('gojo', route, { action: { kind: 'deliver', label: 'DELEGATE' }, bubble, busy: true });
      orientToward('gojo', 'guts');
      orientToward('guts', 'gojo');
      await sleep(420);
      updateNpc('gojo', { action: null, bubble: null, busy: false });
      await returnActorHome('gojo', route.slice(0, -1).reverse());
      updateNpc('guts', { dir: 'front' });
      return;
    }

    if (event.type === 'agent_gateway_received') {
      markSceneLive('guts', bubble || 'Task received. Preparing the provider route.', 'THINKING', 'think');
      setActorActive('guts', {
        kind: 'think',
        bubble: bubble || 'Task received. Preparing the provider route.',
        thinking: true,
      });
      return;
    }

    if (event.type === 'provider_selected') {
      markSceneLive('guts', `Routing the task to ${providerMeta.label}.`, 'ROUTING', 'report');
      const route = resolvePathSpec('gutsToPlanning');
      await animateWalk('guts', route, {
        action: { kind: 'report', label: 'ROUTE' },
        bubble: `Routing the task to ${providerMeta.label}.`,
        busy: true,
      });
      orientToward('guts', providerMeta.actor);
      orientToward(providerMeta.actor, 'guts');
      await sleep(480);
      updateNpc('guts', { action: null, bubble: null, busy: false });
      updateNpc(providerMeta.actor, { bubble: `${providerMeta.label} acknowledged the task.`, busy: true, action: { kind: 'llm', label: providerMeta.label.toUpperCase() } });
      markSceneLive(providerMeta.actor, `${providerMeta.label} acknowledged the task.`, 'PROVIDER', 'llm');
      await sleep(360);
      setActorIdle(providerMeta.actor);
      await returnActorHome('guts', route.slice(0, -1).reverse());
      updateNpc(providerMeta.actor, { dir: 'front' });
      return;
    }

    if (event.type === 'context_compaction_started') {
      const compactionBubble = 'Auto-Compacting context';
      markSceneLive(providerMeta.actor, compactionBubble, 'CONTEXT', 'llm', 'pending');
      setActorActive(providerMeta.actor, {
        kind: 'llm',
        bubble: compactionBubble,
        thinking: true,
      });
      return;
    }

    if (event.type === 'context_compaction_completed') {
      const compactionBubble = 'Auto-Compacting context';
      markSceneLive(providerMeta.actor, compactionBubble, 'CONTEXT', 'llm', 'done');
      setActorIdle(providerMeta.actor);
      return;
    }

    if (event.type === 'llm_thinking_started') {
      const reasoningBubble = bubble || `${providerMeta.label} is reasoning`;
      markSceneLive(providerMeta.actor, reasoningBubble, 'THINKING', 'llm');
      startThinkingPulse(providerMeta.actor, {
        taskId,
        baseBubble: reasoningBubble,
        kind: 'llm',
        tag: 'THINKING',
        stepCurrent: Math.max(1, event.loop_index || 1),
        stepTotal: Math.max(1, event.loop_index || 1),
      });
      await waitForSceneCompletion('thinking', event, taskId);
      setActorIdle(providerMeta.actor);
      return;
    }

    if (event.type === 'llm_thinking_completed') {
      setAgentLive((state) => {
        const nextActorState = completeLatestAgentLiveEntry(state[providerMeta.actor], taskId, 'done');
        if (!nextActorState) return state;
        return {
          ...state,
          [providerMeta.actor]: nextActorState,
        };
      });
      await sleep(220);
      setActorIdle(providerMeta.actor);
      return;
    }

    if (event.type === 'llm_tool_call_requested') {
      if (event.tool_group === 'skill') {
        const skillBubble = skillLoadingBubble(event, providerMeta);
        markSceneLive(providerMeta.actor, skillBubble, 'SKILL', 'skill');
        setActorActive(providerMeta.actor, {
          kind: 'skill',
          bubble: skillBubble,
          thinking: true,
        });
        await sleep(420);
        return;
      }
      markSceneLive(providerMeta.actor, bubble || 'Tool access is required.', 'TOOL', 'llm');
      const routeName = getProviderToToolManagerRoute(providerMeta.actor);
      if (!routeName) {
        setActorActive(providerMeta.actor, { kind: 'llm', bubble: bubble || 'Tool access is required.', thinking: true });
        await sleep(540);
        return;
      }
      const route = resolvePathSpec(routeName);
      await animateWalk(providerMeta.actor, route, {
        action: getProviderToolRequestAction(providerMeta.actor),
        bubble: bubble || 'Tool access is required.',
        busy: true,
        thinking: false,
      });
      await pauseForHandoff(providerMeta.actor, 'lelouch', 460);
      updateNpc(providerMeta.actor, { action: null, bubble: null, busy: false, thinking: false });
      updateNpc('lelouch', { dir: 'front' });
      await returnActorHome(providerMeta.actor, route.slice(0, -1).reverse());
      return;
    }

    if (event.tool_group === 'skill' && (event.type === 'tool_manager_received' || event.type === 'tool_dispatched')) {
      const skillBubble = skillLoadingBubble(event, providerMeta);
      markSceneLive(providerMeta.actor, skillBubble, 'SKILL', 'skill');
      setActorActive(providerMeta.actor, {
        kind: 'skill',
        bubble: skillBubble,
        thinking: true,
      });
      await sleep(180);
      return;
    }

    if (event.type === 'tool_manager_received') {
      markSceneLive('lelouch', bubble || 'Tool request received. Dispatching now.', 'RECEIVED', 'deliver');
      setActorActive('lelouch', {
        kind: 'deliver',
        bubble: bubble || 'Tool request received. Dispatching now.',
      });
      await sleep(260);
      return;
    }

    if (event.type === 'tool_executor_started') {
      const executionBubble = event.tool_group === 'skill'
        ? skillLoadingBubble(event, providerMeta)
        : (bubble || `${event.tool_name || 'Tool'} is running.`);
      markSceneLive(actor, executionBubble, 'EXECUTING', kind);
      setActorActive(actor, { kind, bubble: executionBubble });
      const completedEvent = await waitForSceneCompletion('tool', event, taskId);
      const completionBubble = event.tool_group === 'skill'
        ? skillReadyBubble(completedEvent || event)
        : (completedEvent?.output_summary || 'Execution complete. Preparing the result handoff.');
      markSceneLive(actor, completionBubble, 'COMPLETED', kind, 'done');
      setActorActive(actor, { kind, bubble: completionBubble });
      await sleep(260);
      return;
    }

    if (event.type === 'tool_executor_completed') {
      const completionBubble = event.tool_group === 'skill'
        ? skillReadyBubble(event)
        : (bubble || 'Execution complete. Preparing the result handoff.');
      markSceneLive(actor, completionBubble, 'COMPLETED', kind);
      setActorActive(actor, { kind, bubble: completionBubble });
      await sleep(220);
      return;
    }

    if (event.type === 'tool_dispatched' && routeConfig?.route) {
      markSceneLive(actor, bubble, action.label, kind);
      const dispatchRoute = resolvePathSpec(routeConfig.route);
      await animateWalk(actor, dispatchRoute, {
        action,
        bubble,
        busy: true,
        thinking: false,
      });
      if (targetActorId) {
        await pauseForHandoff(actor, targetActorId, 360);
        updateNpc(targetActorId, { dir: 'front' });
      }
      updateNpc(actor, { action: null, bubble: null, busy: false, thinking: false });
      await returnActorHome(actor, dispatchRoute.slice(0, -1).reverse());
      return;
    }

    if (event.type === 'tool_result_returned') {
      if (event.tool_group === 'skill') {
        const readyBubble = event.message || 'Skill context is ready. Continuing with the provider.';
        markSceneLive(providerMeta.actor, readyBubble, 'SKILL', 'skill');
        setActorActive(providerMeta.actor, {
          kind: 'skill',
          bubble: readyBubble,
          thinking: false,
        });
        await sleep(420);
        setActorActive(providerMeta.actor, {
          kind: 'llm',
          bubble: 'Skill context loaded. Reasoning continues.',
          thinking: true,
        });
        return;
      }
      const reportActor = executorActorId;
      const reportRouteName = getExecutorReportRoute(reportActor);
      const providerRouteName = getToolManagerToProviderRoute(providerMeta.actor);
      if (!reportActor || !reportRouteName || !providerRouteName) {
        markSceneLive(actor, bubble, action.label, kind);
        updateNpc(actor, { action, bubble, busy: true, thinking: kind === 'think' });
        await sleep(640);
        updateNpc(actor, { action: null, bubble: null, busy: false, thinking: false });
        return;
      }

      const reportRoute = resolvePathSpec(reportRouteName);
      const providerRoute = resolvePathSpec(providerRouteName);
      const reportBubble = `${event.tool_name || 'Tool'} finished. Reporting back to the Tool Manager.`;
      markSceneLive(reportActor, reportBubble, 'REPORT', 'report');
      await animateWalk(reportActor, reportRoute, {
        action: { kind: 'report', label: 'REPORT' },
        bubble: reportBubble,
        busy: true,
      });
      await pauseForHandoff(reportActor, 'lelouch', 420);
      updateNpc(reportActor, { action: null, bubble: null, busy: false, thinking: false });
      updateNpc('lelouch', {
        action: { kind: 'deliver', label: 'RECEIVE' },
        bubble: 'Result received. Reporting to the LLM.',
        busy: true,
        thinking: false,
      });
      await sleep(220);
      await returnActorHome(reportActor, reportRoute.slice(0, -1).reverse(), getActorReturnMeta(reportActor));

      const providerBubble = event.message || 'Tool results are ready for review.';
      markSceneLive('lelouch', providerBubble, 'REPORT', 'report');
      await animateWalk('lelouch', providerRoute, {
        action: { kind: 'report', label: 'REPORT' },
        bubble: providerBubble,
        busy: true,
      });
      await pauseForHandoff('lelouch', providerMeta.actor, 460);
      updateNpc('lelouch', { action: null, bubble: null, busy: false, thinking: false });
      updateNpc(providerMeta.actor, { dir: 'front' });
      markSceneLive(providerMeta.actor, 'Tool results received. Re-evaluating.', 'OBSERVED', 'llm');
      setActorActive(providerMeta.actor, { kind: 'llm', bubble: 'Tool results received. Re-evaluating.', thinking: true });
      await returnActorHome('lelouch', providerRoute.slice(0, -1).reverse());
      return;
    }

    if (event.type === 'llm_final_answer') {
      markSceneLive(providerMeta.actor, bubble || 'Final answer ready.', 'ANSWER', 'report');
      const route = resolvePathSpec('okabeToGuts');
      await animateWalk(providerMeta.actor, route, {
        action: { kind: 'report', label: 'REPORT' },
        bubble: bubble || 'Final answer ready.',
        busy: true,
      });
      orientToward(providerMeta.actor, 'guts');
      orientToward('guts', providerMeta.actor);
      await sleep(520);
      updateNpc(providerMeta.actor, { action: null, bubble: null, busy: false, thinking: false });
      await returnActorHome(providerMeta.actor, route.slice(0, -1).reverse());
      markSceneLive('guts', 'Final answer received. Preparing the report.', 'REVIEW', 'think');
      setActorActive('guts', { kind: 'think', bubble: 'Final answer received. Preparing the report.', thinking: true });
      updateNpc('guts', { dir: 'front' });
      return;
    }

    if (routeConfig?.route) {
      markSceneLive(actor, bubble, action.label, kind);
      await animateWalk(actor, resolvePathSpec(routeConfig.route), {
        action,
        bubble,
        busy: true,
        thinking: kind === 'think',
      });
      if (targetActorId) {
        orientToward(actor, targetActorId);
        orientToward(targetActorId, actor);
      }
      await sleep(480);
      updateNpc(actor, { action: null, bubble: null, busy: false, thinking: false });
      if (targetActorId) updateNpc(targetActorId, { dir: 'front' });
      const returnRouteName = actor === 'levi'
        ? 'leviToLelouch'
        : actor === 'itachi'
          ? 'itachiToLelouch'
          : actor === 'mikey'
            ? 'mikeyToLelouch'
          : actor === 'guts'
              ? 'gutsToGojo'
              : null;
      if (event.type === 'agent_gateway_reported') {
        setActorIdle(actor);
        if (targetActorId) updateNpc(targetActorId, { dir: 'front' });
        await sleep(120);
        await returnActorHome(actor, resolvePathSpec(routeConfig.route).slice(0, -1).reverse());
        setActorActive('gojo', {
          kind: 'llm',
          bubble: 'Let me review it myself.',
          thinking: false,
        });
        pushBurst(npcStatesRef.current.gojo?.pos || STATIONS.gojo, KIND_COLORS?.llm || '#efbf64');
        await sleep(760);
        setActorIdle('gojo');
        const finalTask = getTaskById(taskId, targetConvId);
        const finalResult = event.content || finalTask?.answerText || answerBufferRef.current;
        if (!targetConvId || targetConvId === conversationIdRef.current) {
          setHollow({
            title: finalTask?.title || event.message || 'Final Report',
            result: finalResult,
            taskId,
          });
        }
        finalizeTaskPresentation(taskId, finalResult, targetConvId);
      } else if (returnRouteName) {
        await sleep(120);
        await returnActorHome(actor, returnRouteName, actor === 'itachi' ? { preferSideWalk: true } : {});
      } else {
        setActorIdle(actor);
      }
      return;
    }

    markSceneLive(actor, bubble, action.label, kind);
    updateNpc(actor, { action, bubble, busy: true, thinking: kind === 'think' });
    await sleep(640);
    updateNpc(actor, { action: null, bubble: null, busy: false, thinking: false });
  }

  async function uploadAttachment(file, signal, targetConversationId = conversationId, capability = {}) {
    if (!file || !targetConversationId) return null;
    const formData = new FormData();
    formData.append('conversation_id', targetConversationId);
    if (capability.agentId) formData.append('agent_id', capability.agentId);
    if (capability.workflowId) formData.append('workflow_id', capability.workflowId);
    formData.append('file', file);
    const response = await authFetch(`${API_BASE}/api/documents/upload`, {
      method: 'POST',
      body: formData,
      signal,
    });
    if (!response.ok) {
      throw new Error(`upload failed: ${response.status}`);
    }
    return response.json();
  }

  async function uploadChatImage(file, signal, targetConversationId = conversationIdRef.current || conversationId) {
    if (!file || !targetConversationId) {
      throw new Error('No active conversation.');
    }
    const formData = new FormData();
    formData.append('conversation_id', targetConversationId);
    formData.append('file', file);
    const response = await authFetch(`${API_BASE}/api/messages/images`, {
      method: 'POST',
      body: formData,
      signal,
    });
    if (!response.ok) {
      let detail = '';
      try {
        const payload = await response.json();
        detail = String(payload?.detail || '');
      } catch (error) {
        detail = '';
      }
      throw new Error(detail || `image upload failed: ${response.status}`);
    }
    return response.json();
  }

  async function pickLocalWorkspace() {
    if (!conversationId) return;
    const response = await authFetch(`${API_BASE}/api/conversations/${conversationId}/workspace/pick`, {
      method: 'POST',
    });
    if (response.status === 409) {
      showToast('info', 'local workspace selection cancelled');
      return;
    }
    if (!response.ok) {
      let detail = '';
      try {
        const payload = await response.json();
        detail = String(payload?.detail || '');
      } catch (error) {
        detail = '';
      }
      throw new Error(detail || `workspace pick failed: ${response.status}`);
    }
    const detail = await response.json();
    applyConversationSnapshot(detail);
    showToast('success', `local workspace set: ${detail?.workspace_label || 'selected folder'}`);
  }

  async function handleAttachmentSelect(file, selectionId, executionMode = viewModeRef.current || viewMode) {
    const targetConversationId = conversationIdRef.current || conversationId;
    if (!file || !targetConversationId) return;
    const uploadController = new AbortController();
    mutateRuntime(targetConversationId, (rt) => {
      rt.abortRequested = false;
    });
    setRuntimeFetchController(uploadController, targetConversationId);
    setComposerAttachment({
      name: file.name,
      size: file.size,
      type: file.type,
      uploaded: false,
    });
    setUploadState({ active: true, fileName: file.name });
    try {
      const payload = await uploadAttachment(
        file,
        uploadController.signal,
        targetConversationId,
        executionMode === 'chat' ? { agentId: selectionId } : { workflowId: selectionId },
      );
      const nextAttachment = {
        name: payload?.attachment?.file_name || file.name,
        size: payload?.attachment?.size_bytes ?? file.size,
        type: payload?.attachment?.content_type || file.type,
        uploaded: true,
        documentId: payload?.attachment?.document_id || payload?.document?.id || null,
        attachmentId: payload?.attachment?.attachment_id || null,
        title: payload?.attachment?.title || file.name,
        conversationId: payload?.attachment?.conversation_id || targetConversationId,
      };
      if (conversationIdRef.current === targetConversationId) {
        applyConversationSnapshot(payload?.conversation || null);
        setComposerAttachment(nextAttachment);
        showToast('success', `document uploaded: ${String(file.name || '').toLowerCase()}`);
      }
    } catch (error) {
      if (conversationIdRef.current === targetConversationId) {
        setComposerAttachment(null);
      }
      const targetRuntime = getRuntime(targetConversationId);
      const uploadAborted = targetRuntime ? targetRuntime.abortRequested : abortRef.current;
      if (conversationIdRef.current === targetConversationId && !(uploadAborted || error?.name === 'AbortError')) {
        showToast('error', `upload failed: ${String(file.name || '').toLowerCase()}`);
      }
      throw error;
    } finally {
      const rt = getRuntime(targetConversationId);
      if (rt && rt.fetchController === uploadController) {
        setRuntimeFetchController(null, targetConversationId);
      }
      setUploadState({ active: false, fileName: '' });
    }
  }

  function handleAttachmentClear() {
    setComposerAttachment(null);
  }

  async function cancelActiveTask(taskId) {
    return authFetch(`${API_BASE}/api/tasks/${taskId}/cancel`, {
      method: 'POST',
    });
  }

  async function cancelActiveConversationTask(nextConversationId) {
    if (!nextConversationId) return null;
    return authFetch(`${API_BASE}/api/conversations/${nextConversationId}/tasks/cancel`, {
      method: 'POST',
    });
  }

  function activeTaskIdFromConversationSnapshot(conversation) {
    const candidates = (conversation?.tasks || []).filter((task) => isTaskActuallyActive(task));
    candidates.sort((a, b) => taskUpdatedTimestamp(b) - taskUpdatedTimestamp(a));
    const task = candidates[0];
    return task?.taskId || task?.task_id || task?.id || null;
  }

  async function stopConversationRuntimeBeforeDelete(nextConversationId, conversationSnapshot = null) {
    if (!nextConversationId) return;
    const targetRuntime = getRuntime(nextConversationId);
    const taskState = targetRuntime?.worldTaskState || null;
    const taskId = targetRuntime?.activeTaskId
      || taskState?.activeTaskId
      || activeTaskIdFromConversationSnapshot(conversationSnapshot);
    const runId = targetRuntime?.activeRunId || null;
    if (runId && targetRuntime) targetRuntime.cancelledRunIds.add(runId);
    if (taskId) {
      userCancelledTaskIdsRef.current.add(taskId);
      chatFinalizedTaskIdsRef.current.add(taskId);
    }
    targetRuntime?.fetchController?.abort?.();
    if (targetRuntime) {
      mutateRuntime(nextConversationId, (rt) => {
        rt.worldTaskState = {
          ...rt.worldTaskState,
          activeTaskId: null,
          pendingTask: null,
        };
        rt.activeTaskId = null;
        rt.activeRunId = null;
        rt.fetchController = null;
        rt.busy = false;
      });
    }
    try {
      if (taskId) {
        await cancelActiveTask(taskId);
      } else {
        await cancelActiveConversationTask(nextConversationId);
      }
    } catch (error) {
      console.warn('conversation cleanup before delete skipped:', error);
    }
    runtimesRef.current.delete(nextConversationId);
  }

  async function updateConversationTitle(conversationId, title) {
    const trimmed = String(title || '').trim();
    if (!conversationId || !trimmed) return null;
    const response = await authFetch(`${API_BASE}/api/conversations/${conversationId}`, {
      method: 'PATCH',
      headers: buildApiHeaders(),
      body: JSON.stringify({ title: trimmed }),
    });
    if (!response.ok) {
      throw new Error(`conversation title update failed: ${response.status}`);
    }
    return response.json();
  }

  async function readNdjsonStream(response, onEvent, signal) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const cancelReader = () => {
      reader.cancel().catch(() => undefined);
    };
    if (signal?.aborted) {
      await reader.cancel().catch(() => undefined);
      return;
    }
    signal?.addEventListener?.('abort', cancelReader, { once: true });
    let buffer = '';
    try {
      while (true) {
        if (signal?.aborted) return;
        const { value, done } = await reader.read();
        if (done || signal?.aborted) break;
        buffer += decoder.decode(value, { stream: true });
        let newlineIndex = buffer.indexOf('\n');
        while (newlineIndex >= 0) {
          if (signal?.aborted) return;
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (line) {
            const event = normalizeWorldEvent(JSON.parse(line));
            if (event && !signal?.aborted) onEvent(event);
          }
          newlineIndex = buffer.indexOf('\n');
        }
      }
      if (signal?.aborted) return;
      const tail = buffer.trim();
      if (tail) {
        const event = normalizeWorldEvent(JSON.parse(tail));
        if (event && !signal?.aborted) onEvent(event);
      }
    } catch (error) {
      if (signal?.aborted || error?.name === 'AbortError') return;
      throw error;
    } finally {
      signal?.removeEventListener?.('abort', cancelReader);
    }
  }

  function applyWorldEvent(event, targetConvId = null) {
  const eventConversationId = event.conversation_id || null;
    const ownerConvId = activeRuntimeTargetConvId(targetConvId);
    if (eventConversationId && ownerConvId && eventConversationId !== ownerConvId) {
      return;
    }
    const taskId = ensureTaskForEvent(event, ownerConvId);
    if (!taskId) return;
    if (
      chatFinalizedTaskIdsRef.current.has(taskId)
      && !CHAT_FINAL_FOLLOWUP_EVENT_TYPES.has(event.type)
    ) {
      updateWorldTaskState((state) => (
        state.activeTaskId === taskId ? { ...state, activeTaskId: null } : state
      ));
      return;
    }
    appendTaskEvent(taskId, event);
    const loopIndex = Math.max(1, event.loop_index || 1);
    if (isChatOriginTask(taskId, ownerConvId)) {
      const progressLine = getChatProgressLine(event);
      if (progressLine) {
        updateTaskById(taskId, (run) => ({
          ...run,
          chatStreamText: appendChatProgressText(run.chatStreamText, progressLine),
        }));
      }
    }

    switch (event.type) {
      case 'workflow_started':
        updateTaskById(taskId, (run) => ({
          ...run,
          workflowRun: {
            workflow_id: event.workflow_id || run.requestedWorkflowId,
            run_id: event.workflow_run_id || '',
            status: 'running',
            current_node_id: null,
            nodes: {},
          },
        }));
        break;
      case 'workflow_node_started':
        updateTaskById(taskId, (run) => ({
          ...run,
          workflowRun: {
            ...(run.workflowRun || {}),
            status: 'running',
            current_node_id: event.workflow_node_id,
            nodes: {
              ...(run.workflowRun?.nodes || {}),
              [event.workflow_node_id]: {
                ...(run.workflowRun?.nodes?.[event.workflow_node_id] || {}),
                status: 'running',
                success: null,
                started_at: event.started_at || event.created_at,
              },
            },
          },
        }));
        break;
      case 'workflow_node_finished':
        updateTaskById(taskId, (run) => ({
          ...run,
          workflowRun: {
            ...(run.workflowRun || {}),
            current_node_id: event.workflow_node_id,
            nodes: {
              ...(run.workflowRun?.nodes || {}),
              [event.workflow_node_id]: {
                ...(run.workflowRun?.nodes?.[event.workflow_node_id] || {}),
                status: event.status || (event.success === false ? 'failed' : 'done'),
                success: event.success !== false,
                summary: event.summary || '',
                error: event.error || '',
                started_at: event.started_at || run.workflowRun?.nodes?.[event.workflow_node_id]?.started_at,
                finished_at: event.finished_at || event.created_at,
                duration_ms: event.duration_ms,
              },
            },
          },
        }));
        break;
      case 'workflow_finished':
      case 'workflow_failed':
        pendingPresentationTaskIdsRef.current.add(taskId);
        updateTaskById(taskId, (run) => ({
          ...run,
          workflowRun: {
            ...(run.workflowRun || {}),
            status: event.type === 'workflow_failed' ? 'failed' : 'done',
            current_node_id: null,
          },
        }));
        break;
      case 'context_usage_updated': {
        if (event.source === 'provider_usage' && event.context_used_tokens == null && event.usedTokens == null) {
          break;
        }
        const usageConversationId = event.conversation_id || ownerConvId || conversationId;
        const nextContextUsage = normalizeContextUsage({
          conversationId: usageConversationId,
          contextUsedTokens: event.context_used_tokens,
          contextTotalTokens: event.context_total_tokens,
          usedTokens: event.usedTokens ?? event.used_tokens,
          totalTokens: event.totalTokens ?? event.total_tokens,
          valid: event.valid_context_usage,
          compressed: event.compressed,
          compressedCount: event.compressed_count,
          updatedAt: event.created_at || event.timestamp || new Date().toISOString(),
        }, usageConversationId);
        if (!nextContextUsage.valid) {
          break;
        }
        if (!ownerConvId || ownerConvId === conversationIdRef.current) {
          setContextUsage(nextContextUsage);
        }
        saveStoredContextUsage(nextContextUsage);
        break;
      }
      case 'user_message_received':
        chatFinalizedTaskIdsRef.current.delete(taskId);
        dropPendingSceneItems();
        resetSceneActors();
        updateTaskById(taskId, (run) => ({
          ...run,
          status: 'queued',
          stage: 'assigned',
          loopIndex: 0,
        }));
        break;
      case 'agent_gateway_received':
        updateTaskById(taskId, (run) => ({ ...run, status: 'running', stage: 'in_progress' }));
        break;
      case 'provider_selected': {
        const providerMeta = resolveProviderMeta(event, getTaskById(taskId));
        updateTaskById(taskId, (run) => ({
          ...run,
          provider: providerMeta.label,
          providerKey: providerMeta.key,
          requestedProvider: providerMeta.key,
          providerState: {
            provider: providerMeta.label,
            state: 'selected',
            selected: true,
            reason: event.reason || '',
            model: event.model || null,
          },
        }));
        break;
      }
      case 'context_compaction_started': {
        updateTaskById(taskId, (run) => ({
          ...run,
          status: 'running',
          stage: 'in_progress',
          loopIndex,
          providerState: run.providerState ? { ...run.providerState, state: 'compressing_context' } : run.providerState,
        }));
        break;
      }
      case 'context_compaction_completed': {
        updateTaskById(taskId, (run) => ({
          ...run,
          status: 'running',
          stage: 'in_progress',
          loopIndex,
          providerState: run.providerState ? { ...run.providerState, state: 'ready' } : run.providerState,
        }));
        break;
      }
      case 'llm_thinking_started': {
        updateTaskById(taskId, (run) => ({
          ...run,
          stage: 'in_progress',
          loopIndex,
          providerState: run.providerState ? { ...run.providerState, state: 'thinking' } : run.providerState,
        }));
        break;
      }
      case 'llm_thinking_delta': {
        updateTaskById(taskId, (run) => ({
          ...run,
          stage: 'in_progress',
          loopIndex,
          providerState: run.providerState ? { ...run.providerState, state: 'thinking' } : run.providerState,
        }));
        break;
      }
      case 'agent_progress_delta': {
        updateTaskById(taskId, (run) => ({
          ...run,
          stage: 'in_progress',
          loopIndex,
          providerState: run.providerState ? { ...run.providerState, state: 'thinking' } : run.providerState,
        }));
        break;
      }
      case 'llm_thinking_completed': {
        updateTaskById(taskId, (run) => ({
          ...run,
          providerState: run.providerState ? { ...run.providerState, state: 'ready' } : run.providerState,
        }));
        break;
      }
      case 'llm_tool_call_requested': {
        updateTaskById(taskId, (run) => ({
          ...run,
          stage: 'in_progress',
          loopIndex,
            toolCalls: upsertToolCall(run.toolCalls, event.call_id, {
              callId: event.call_id,
              loopIndex,
            toolGroup: event.tool_group || 'external',
            kind: event.kind || 'tool',
            toolName: event.tool_name || 'unknown',
              executorRole: event.executor_role || null,
              executorActorId: event.executor_actor_id || null,
              skillName: event.skill_name || '',
              skillPath: event.skill_path || '',
            state: 'requested',
            inputSummary: event.input_summary || '',
            toolInput: event.tool_input || null,
            toolResponse: event.tool_response || null,
            toolOutput: event.tool_output || '',
            message: event.message || '',
          }),
          }));
        break;
      }
      case 'tool_manager_received':
      case 'tool_dispatched':
      case 'tool_executor_started':
      case 'tool_executor_completed':
      case 'tool_result_returned':
        updateTaskById(taskId, (run) => {
          const existingToolCall = Array.isArray(run.toolCalls)
            ? run.toolCalls.find((item) => item.callId === event.call_id)
            : null;
          let nextState = event.type === 'tool_manager_received'
            ? 'received'
            : event.type === 'tool_dispatched'
              ? 'dispatched'
              : event.type === 'tool_executor_started'
                ? 'running'
                : event.type === 'tool_executor_completed'
                  ? 'completed'
                  : 'returned';
          const responseState = getToolResponseTraceStatus(event.tool_response, '');
          if (responseState === 'failed') {
            nextState = 'failed';
          } else if (responseState === 'done' && (nextState === 'completed' || nextState === 'returned')) {
            nextState = 'completed';
          }
          return {
            ...run,
            stage: 'in_progress',
            loopIndex,
            toolCalls: upsertToolCall(run.toolCalls, event.call_id, {
              callId: event.call_id,
              loopIndex,
              toolGroup: event.tool_group || 'external',
              kind: event.kind || existingToolCall?.kind || 'tool',
              toolName: event.tool_name || 'unknown',
              executorRole: event.executor_role || existingToolCall?.executorRole || event.target || event.actor || null,
              executorActorId: event.executor_actor_id || existingToolCall?.executorActorId || null,
              skillName: event.skill_name || existingToolCall?.skillName || '',
              skillPath: event.skill_path || existingToolCall?.skillPath || '',
              state: nextState,
              // 关键：必须用 existing 值兜底，否则后续事件（tool_manager_received / tool_dispatched 等）
              // 不携带 input_summary 时，patch 里的 undefined 会通过 spread 把已设值覆盖回 undefined。
              inputSummary: event.input_summary || existingToolCall?.inputSummary || '',
              outputSummary: event.output_summary || existingToolCall?.outputSummary || '',
              toolInput: event.tool_input || existingToolCall?.toolInput || null,
              toolResponse: event.tool_response || existingToolCall?.toolResponse || null,
              toolOutput: event.tool_output || existingToolCall?.toolOutput || '',
              message: event.message || existingToolCall?.message || '',
            }),
          };
        });
        break;
      case 'sub_agent_progress_delta':
      case 'sub_agent_answer_delta':
      case 'sub_agent_tool_call_requested':
      case 'sub_agent_tool_executor_completed':
      case 'sub_agent_started':
      case 'sub_agent_finished':
        updateTaskById(taskId, (run) => ({
          ...run,
          stage: 'in_progress',
          loopIndex,
        }));
        break;
      case 'llm_answer_delta': {
        if (chatFinalizedTaskIdsRef.current.has(taskId) || getTaskById(taskId)?.serverFinished) {
          break;
        }
        setRuntimeAnswerBuffer(appendAnswerDelta(
          readRuntimeAnswerBuffer(),
          eventDeltaText(event)
        ));
        updateTaskById(taskId, (run) => ({
          ...run,
          status: isTerminalTaskStatus(run.status) ? run.status : 'running',
          stage: 'in_progress',
          answerText: readRuntimeAnswerBuffer(),
          chatStreamText: run.chatStreamText,
          loopIndex,
        }));
        break;
      }
      case 'llm_final_answer': {
        const finalAnswerText = toDisplayText(
          event.content
          ?? event.answer_text
          ?? event.answer
          ?? event.final_answer
          ?? event.text
          ?? event.message
          ?? readRuntimeAnswerBuffer()
        );
        setRuntimeAnswerBuffer(finalAnswerText || readRuntimeAnswerBuffer());
        if (isChatOriginTask(taskId, ownerConvId)) {
          chatFinalizedTaskIdsRef.current.add(taskId);
          updateTaskById(taskId, (run) => ({
            ...run,
            status: 'done',
            stage: 'done',
            completedAt: run.completedAt || Date.now(),
            loopIndex,
            answerText: readRuntimeAnswerBuffer(),
            presentationPending: false,
            serverFinished: true,
            sceneCatchup: false,
            providerState: run.providerState ? { ...run.providerState, state: 'completed' } : run.providerState,
          }));
          updateWorldTaskState((state) => ({ ...state, activeTaskId: null }));
          setRuntimeBusy(false);
          setRuntimeActiveTaskId(null);
          completeTaskAgents(taskId, 'done');
          break;
        }
        updateTaskById(taskId, (run) => ({
          ...run,
          stage: 'check',
          loopIndex,
          answerText: readRuntimeAnswerBuffer(),
          providerState: run.providerState ? { ...run.providerState, state: 'completed' } : run.providerState,
        }));
        break;
      }
      case 'agent_gateway_reported':
        if (isChatOriginTask(taskId, ownerConvId)) {
          chatFinalizedTaskIdsRef.current.add(taskId);
          pendingPresentationTaskIdsRef.current.delete(taskId);
          updateTaskById(taskId, (run) => ({
            ...run,
            status: 'done',
            stage: 'done',
            completedAt: run.completedAt || Date.now(),
            answerText: run.answerText || event.content || readRuntimeAnswerBuffer(),
            presentationPending: false,
            serverFinished: true,
            sceneCatchup: false,
          }));
          updateWorldTaskState((state) => ({ ...state, activeTaskId: null }));
          setRuntimeBusy(false);
          setRuntimeActiveTaskId(null);
          setRuntimeFetchController(null);
          dropPendingSceneItems(taskId);
          completeTaskAgents(taskId, 'done');
          break;
        }
        pendingPresentationTaskIdsRef.current.add(taskId);
        updateTaskById(taskId, (run) => ({
          ...run,
          stage: 'check',
          loopIndex,
          answerText: event.content || readRuntimeAnswerBuffer(),
          presentationPending: true,
        }));
        break;
      case 'run_cancelled':
        pendingPresentationTaskIdsRef.current.delete(taskId);
        chatFinalizedTaskIdsRef.current.add(taskId);
        updateTaskById(taskId, (run) => applyTerminalTaskState(run, 'cancelled', { aborted: true }));
        updateWorldTaskState((state) => ({ ...state, activeTaskId: null }));
        setRuntimeBusy(false);
        setRuntimeActiveTaskId(null);
        setRuntimeFetchController(null);
        dropPendingSceneItems(taskId);
        resetSceneActors();
        completeTaskAgents(taskId, 'cancelled');
        break;
      case 'run_error':
        pendingPresentationTaskIdsRef.current.delete(taskId);
        chatFinalizedTaskIdsRef.current.add(taskId);
        updateTaskById(taskId, (run) => applyTerminalTaskState(run, 'failed', {
          error: toDisplayText(event.message),
          aborted: false,
        }));
        updateWorldTaskState((state) => ({ ...state, activeTaskId: null }));
        setRuntimeBusy(false);
        setRuntimeActiveTaskId(null);
        setRuntimeFetchController(null);
        dropPendingSceneItems(taskId);
        resetSceneActors();
        completeTaskAgents(taskId, 'failed');
        break;
      case 'run_finished':
        const shouldWaitForPresentation = pendingPresentationTaskIdsRef.current.has(taskId)
          || !!getTaskById(taskId)?.presentationPending;
        updateTaskById(taskId, (run) => {
          const hasPresentationPending = pendingPresentationTaskIdsRef.current.has(taskId)
            || !!run.presentationPending;
          const persistedTask = event.task || null;
          const persistedImages = normalizeChatImageRefs(
            persistedTask?.image_attachments || persistedTask?.imageAttachments || [],
            persistedTask?.conversation_id || event.conversation_id || run.conversationId,
            userIdRef.current,
          );
          const terminalStatus = normalizeTaskStatus(
            persistedTask?.status
            || event.status
            || run.status
          );
          const terminalError = persistedTask?.error || run.error;
          const terminalBase = isTerminalTaskStatus(terminalStatus) && terminalStatus !== 'done'
            ? applyTerminalTaskState(run, terminalStatus, {
                error: terminalError,
                aborted: terminalStatus === 'cancelled' ? true : run.aborted,
              })
            : run;
          return {
            ...terminalBase,
            taskId: persistedTask?.task_id || run.taskId,
            conversationId: persistedTask?.conversation_id || event.conversation_id || run.conversationId,
            title: stripChatImageAugmentation(persistedTask?.title || run.title).text || run.title,
            status: terminalStatus,
            stage: terminalStatus === 'done'
              ? (hasPresentationPending ? (persistedTask?.stage || run.stage) : (persistedTask?.stage || 'done'))
              : 'done',
            requestedAgentId: persistedTask?.agent_id || persistedTask?.profile_id || run.requestedAgentId || null,
            requestedWorkflowId: persistedTask?.workflow_id || run.requestedWorkflowId || null,
            executionMode: persistedTask?.execution_mode === 'bot' ? 'bot' : (run.executionMode || 'chat'),
            originViewMode: persistedTask?.execution_mode === 'bot' ? 'world' : (run.originViewMode || 'chat'),
            workflowSnapshot: persistedTask?.workflow_snapshot || run.workflowSnapshot || null,
            profileId: persistedTask?.profile_id || run.profileId || null,
            profileDisplayName: persistedTask?.profile_display_name || run.profileDisplayName || '',
            completedAt: persistedTask?.completed_at
              ? (Date.parse(persistedTask.completed_at) || Date.now())
              : (hasPresentationPending ? run.completedAt : Date.now()),
            sources: Array.isArray(persistedTask?.sources)
              ? persistedTask.sources
              : (Array.isArray(event.sources) ? event.sources : run.sources),
            memory: Array.isArray(persistedTask?.memory)
              ? persistedTask.memory
              : (Array.isArray(event.memory) ? event.memory : run.memory),
            attachment: Array.isArray(persistedTask?.attachments) && persistedTask.attachments.length
              ? { ...persistedTask.attachments[0], uploaded: true }
              : run.attachment,
            attachments: Array.isArray(persistedTask?.attachments)
              ? persistedTask.attachments.map((attachment) => ({ ...attachment, uploaded: true }))
              : run.attachments,
            imageAttachments: persistedImages.length > 0
              ? mergeChatImageRefs(run.imageAttachments || [], persistedImages)
              : run.imageAttachments,
            answerText: chatFinalizedTaskIdsRef.current.has(taskId) && run.answerText
              ? run.answerText
              : (persistedTask?.answer_text || (terminalStatus === 'done' ? (toDisplayText(event.message) || run.answerText) : run.answerText)),
            error: terminalError,
            serverFinished: true,
            sceneCatchup: hasPresentationPending,
          };
        });
        if (shouldWaitForPresentation && !isChatOriginTask(taskId, ownerConvId)) {
          compactPendingSceneItems(taskId, ownerConvId);
          break;
        }
        updateWorldTaskState((state) => ({ ...state, activeTaskId: null }));
        setRuntimeBusy(false);
        setRuntimeActiveTaskId(null);
        setRuntimeFetchController(null);
        dropPendingSceneItems(taskId);
        resetSceneActors();
        completeTaskAgents(taskId, getTaskById(taskId)?.status || event.status || 'done');
        break;
      default:
        break;
    }

    if (
      (isBotWorkflowTask(taskId, ownerConvId) && WORKFLOW_SCENE_EVENT_TYPES.has(event.type))
      || (!isBotWorkflowTask(taskId, ownerConvId) && WORLD_SCENE_EVENT_TYPES.has(event.type) && !isChatOriginTask(taskId, ownerConvId))
    ) {
      scheduleSceneEvent(event, taskId, ownerConvId);
    }
  }

  async function executeQuest(pendingTask, targetConversationId) {
    const runConversationId = targetConversationId;
    if (!runConversationId) {
      throw new Error('conversation is not ready');
    }
    const runId = pendingTask.id || generateHexId();
    pendingTask.id = runId;
    // Ensure the runtime exists and prime its run-local state.
    mutateRuntime(runConversationId, (rt) => {
      rt.activeRunId = runId;
      rt.cancelledRunIds.delete(runId);
      rt.answerBuffer = '';
      rt.busy = true;
      rt.abortRequested = false;
      rt.shellSeeded = false;
    });
    updateWorldTaskState((state) => ({
      ...state,
      pendingTask: {
        ...pendingTask,
        status: 'running',
        stage: 'assigned',
      },
    }), runConversationId);

    if (pendingTask.attachment?.file && !pendingTask.attachment?.uploaded) {
      const uploadController = new AbortController();
      const uploadName = pendingTask.attachment.name || pendingTask.attachment.file.name || 'document';
      setRuntimeFetchController(uploadController, runConversationId);
      setUploadState({ active: true, fileName: uploadName });
      try {
        const payload = await uploadAttachment(
          pendingTask.attachment.file,
          uploadController.signal,
          runConversationId,
          pendingTask.executionMode === 'bot'
            ? { workflowId: pendingTask.requestedWorkflowId }
            : { agentId: pendingTask.requestedAgentId },
        );
        const runRuntimeForGuard = getRuntime(runConversationId);
        if (!runRuntimeForGuard || runRuntimeForGuard.activeRunId !== runId) {
          return;
        }
        const nextAttachment = {
          name: payload?.attachment?.file_name || uploadName,
          size: payload?.attachment?.size_bytes ?? pendingTask.attachment.size,
          type: payload?.attachment?.content_type || pendingTask.attachment.type,
          uploaded: true,
          documentId: payload?.attachment?.document_id || payload?.document?.id || null,
          attachmentId: payload?.attachment?.attachment_id || null,
          title: payload?.attachment?.title || pendingTask.attachment.name || uploadName,
          conversationId: payload?.attachment?.conversation_id || runConversationId,
        };
        pendingTask.attachment = { ...pendingTask.attachment, ...nextAttachment };
        applyConversationSnapshot(payload?.conversation || null);
        setComposerAttachment(nextAttachment);
        showToast('success', `document uploaded: ${String(uploadName || '').toLowerCase()}`);
      } catch (error) {
        const runRuntimeForError = getRuntime(runConversationId);
        if (!((runRuntimeForError?.abortRequested) || error?.name === 'AbortError')) {
          showToast('error', `upload failed: ${String(uploadName || '').toLowerCase()}`);
        }
        throw error;
      } finally {
        const guardRt = getRuntime(runConversationId);
        if (guardRt && guardRt.fetchController === uploadController) {
          setRuntimeFetchController(null, runConversationId);
        }
        setUploadState({ active: false, fileName: '' });
      }
    }

    const controller = new AbortController();
    setRuntimeFetchController(controller, runConversationId);
    const response = await authFetch(`${API_BASE}/api/conversations/${runConversationId}/tasks/stream`, {
      method: 'POST',
      headers: buildApiHeaders(),
      body: JSON.stringify({
        message: pendingTask.title,
        attachments: pendingTask.attachment ? [{
          name: pendingTask.attachment.name,
          size: pendingTask.attachment.size,
          type: pendingTask.attachment.type,
          title: pendingTask.attachment.title || pendingTask.attachment.name,
          file_name: pendingTask.attachment.name,
          attachment_id: pendingTask.attachment.attachmentId || null,
          document_id: pendingTask.attachment.documentId || null,
        }] : [],
        image_attachments: Array.isArray(pendingTask.imageAttachments) ? pendingTask.imageAttachments : [],
        options: {
          provider: pendingTask.requestedProvider || null,
          model_id: pendingTask.requestedModelId || null,
          agent_id: pendingTask.requestedAgentId || null,
          workflow_id: pendingTask.requestedWorkflowId || null,
          execution_mode: pendingTask.executionMode === 'bot' ? 'bot' : 'chat',
          // Fallback when no per-task choice exists. Matches DEFAULT_REASONING_EFFORT
          // in panels.jsx — kept in sync so request payload mirrors UI default.
          reasoning_effort: pendingTask.requestedReasoningEffort || 'high',
          use_history: true,
        },
      }),
      signal: controller.signal,
    });
    if (!response.ok || !response.body) {
      throw new Error(`world stream failed: ${response.status}`);
    }

    const queuedEvents = [];
    let flushTimer = null;
    const runRuntime = getRuntime(runConversationId, { create: true });
    const flushQueuedEvents = () => {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      const batch = queuedEvents.splice(0);
      const previousTarget = streamTargetConvIdRef.current;
      streamTargetConvIdRef.current = runConversationId;
      try {
        for (const event of batch) {
          if (
            controller.signal.aborted
            || runRuntime.abortRequested
            || runRuntime.activeRunId !== runId
            || runRuntime.cancelledRunIds.has(runId)
            || (event.conversation_id && event.conversation_id !== runConversationId)
          ) {
            continue;
          }
          if (event.task_id && !chatFinalizedTaskIdsRef.current.has(event.task_id)) {
            setRuntimeActiveTaskId(event.task_id, runConversationId);
          }
          applyWorldEvent(event, runConversationId);
        }
      } finally {
        streamTargetConvIdRef.current = previousTarget;
      }
    };
    const queueWorldEvent = (event) => {
      if (STREAM_IMMEDIATE_EVENT_TYPES.has(event.type)) {
        flushQueuedEvents();
        queuedEvents.push(event);
        flushQueuedEvents();
        return;
      }
      queuedEvents.push(event);
      if (!flushTimer) {
        flushTimer = setTimeout(flushQueuedEvents, STREAM_EVENT_BATCH_MS);
      }
    };
    try {
      await readNdjsonStream(response, queueWorldEvent, controller.signal);
    } finally {
      flushQueuedEvents();
      const guardRt = getRuntime(runConversationId);
      if (guardRt && guardRt.fetchController === controller) {
        setRuntimeFetchController(null, runConversationId);
      }
    }
  }

  function handleStop() {
    const hadQueuedDeploy = Boolean(queuedDeploy);
    if (hadQueuedDeploy) setQueuedDeploy(null);
    // Stop targets the currently-shown conversation only — other backgrounded
    // conversations continue running. All ref/state reads scope to its runtime.
    const targetConvId = conversationIdRef.current;
    const targetRuntime = targetConvId ? getRuntime(targetConvId) : null;
    const currentTaskState = targetRuntime ? targetRuntime.worldTaskState : worldTaskStateRef.current;
    let taskId = (targetRuntime ? targetRuntime.activeTaskId : activeTaskIdRef.current)
      || currentTaskState.activeTaskId
      || null;
    if (!taskId) {
      const tasksById = currentTaskState.tasksById || {};
      const candidates = Object.values(tasksById).filter((task) => isTaskActuallyActive(task));
      candidates.sort((a, b) => taskUpdatedTimestamp(b) - taskUpdatedTimestamp(a));
      const fallback = candidates[0];
      if (fallback?.taskId) taskId = fallback.taskId;
    }
    const runId = targetRuntime ? targetRuntime.activeRunId : activeRunIdRef.current;
    const controllerToAbort = targetRuntime ? targetRuntime.fetchController : fetchAbortRef.current;
    const runtimeBusy = targetRuntime ? targetRuntime.busy : busy;
    const hasActiveRun = runtimeBusy || taskId || currentTaskState.pendingTask || controllerToAbort;
    if (!hasActiveRun) return;
    if (targetRuntime) {
      targetRuntime.abortRequested = true;
      if (runId) targetRuntime.cancelledRunIds.add(runId);
    } else {
      abortRef.current = true;
    }
    if (taskId) {
      userCancelledTaskIdsRef.current.add(taskId);
      cancelActiveTask(taskId).catch((error) => {
        console.error('cancel failed', error);
      });
    } else {
      cancelActiveConversationTask(targetConvId).catch((error) => {
        console.error('conversation cancel failed', error);
      });
    }
    controllerToAbort?.abort?.();
    if (taskId) {
      // 关键：把 taskId 加入 finalized set，让 applyWorldEvent 早退，
      // 避免后续 in-flight 的 SSE 事件把 status 从 'cancelled' 改回 'running'。
      chatFinalizedTaskIdsRef.current.add(taskId);
      updateTaskById(taskId, (task) => applyTerminalTaskState(task, 'cancelled', { aborted: true }), targetConvId);
      updateWorldTaskState((state) => ({
        ...state,
        activeTaskId: null,
        pendingTask: null,
        taskOrder: state.taskOrder.includes(taskId) ? state.taskOrder : [...state.taskOrder, taskId],
      }), targetConvId);
      dropPendingSceneItems(taskId);
    } else {
      updateWorldTaskState((state) => ({
        ...state,
        activeTaskId: null,
        pendingTask: state.pendingTask
          ? applyTerminalTaskState(state.pendingTask, 'cancelled', { aborted: true })
          : null,
      }), targetConvId);
      dropPendingSceneItems();
    }
    if (targetConvId) {
      mutateRuntime(targetConvId, (rt) => {
        rt.activeTaskId = null;
        rt.activeRunId = null;
        rt.fetchController = null;
        rt.busy = false;
      });
    } else {
      activeTaskIdRef.current = null;
      activeRunIdRef.current = null;
      fetchAbortRef.current = null;
      setBusy(false);
    }
    resetSceneActors();
  }

  function buildDeployRequest(text, attachment, modelId, reasoningEffort, imageAttachments, selectionId, providerRequest) {
    const sanitizedImageAttachments = Array.isArray(imageAttachments)
      ? imageAttachments
          .filter((ref) => ref && ref.image_id && ref.path)
          .map((ref) => ({
            image_id: ref.image_id,
            path: ref.path,
            mime: ref.mime || null,
            previewUrl: ref.previewUrl || null,
          }))
      : [];
    return {
      id: `queued-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      text,
      attachment,
      modelId,
      reasoningEffort,
      imageAttachments: sanitizedImageAttachments,
      executionMode: viewModeRef.current === 'chat' ? 'chat' : 'bot',
      agentId: viewModeRef.current === 'chat' ? selectionId : null,
      workflowId: viewModeRef.current === 'chat' ? null : selectionId,
      providerRequest: providerRequest || '',
      targetConversationId: selectedConversationId || conversationIdRef.current || conversationId || null,
    };
  }

  function canStartDeployForConversation(targetConversationId = null) {
    const activeConversationId = conversationIdRef.current || conversationId;
    if (!conversationReady || conversationSelectionPending || conversationError) return false;
    if (!activeConversationId) return false;
    return !targetConversationId || activeConversationId === targetConversationId;
  }

  function startDeploy(request, deployConvId) {
    if (!deployConvId) return;
    const text = request.text;
    const attachment = request.attachment || null;
    const modelId = request.modelId || '';
    const reasoningEffort = request.reasoningEffort || 'high';
    const executionMode = request.executionMode === 'bot' ? 'bot' : 'chat';
    const agentId = executionMode === 'chat'
      ? (request.agentId || defaultAgentId || APP_DEFAULT_AGENT_OPTIONS[0].id)
      : null;
    const workflowId = executionMode === 'bot'
      ? (request.workflowId || defaultWorkflowId)
      : null;
    const sanitizedImageAttachments = Array.isArray(request.imageAttachments) ? request.imageAttachments : [];
    const pendingTask = createPendingTaskDraft(text, attachment, sanitizedImageAttachments);
    pendingTask.requestedModelId = modelId || '';
    pendingTask.requestedAgentId = agentId;
    pendingTask.requestedWorkflowId = workflowId;
    pendingTask.executionMode = executionMode;
    if (executionMode === 'bot') {
      const workflows = normalizeWorkflowSettings(workflowSettingsDraft);
      pendingTask.workflowSnapshot = [...workflows.presets, ...workflows.custom]
        .find((item) => item.workflow_id === workflowId) || null;
    }
    // Match DEFAULT_REASONING_EFFORT in panels.jsx (kept in sync).
    pendingTask.requestedReasoningEffort = reasoningEffort || 'high';
    pendingTask.requestedProvider = request.providerRequest || '';
    pendingTask.originViewMode = viewModeRef.current || viewMode;
    pendingTask.imageAttachments = sanitizedImageAttachments;
    const nextConversationTitle = titleFromTaskText(text);
    const currentConversation = findConversationById(workspaceState, deployConvId);
    const deployTaskState = getRuntime(deployConvId)?.worldTaskState
      || worldTaskStateRef.current
      || createEmptyWorldTaskState();
    const shouldUpdateConversationTitle = Boolean(
      nextConversationTitle
      && currentConversation
      && isDefaultConversationName(currentConversation.name)
      && (currentConversation.tasks || []).length === 0
    );
    setComposerAttachment(null);
    setWorkspaceState((state) => {
      const currentTasks = [
        ...deployTaskState.taskOrder
          .map((taskId) => deployTaskState.tasksById[taskId])
          .filter(Boolean),
        pendingTask,
      ];
      return workspaceStateWithTouchedConversation(state, deployConvId, {
        tasks: currentTasks,
        agentId: pendingTask.requestedAgentId || undefined,
        // No explicit `expanded`: the touched conversation becomes active and
        // withDefaultExpansion auto-expands the active conversation with tasks.
        name: shouldUpdateConversationTitle ? nextConversationTitle : undefined,
        title: shouldUpdateConversationTitle ? nextConversationTitle : undefined,
      });
    });
    if (shouldUpdateConversationTitle) {
      updateConversationTitle(deployConvId, nextConversationTitle)
        .then((detail) => {
          if (detail) {
            setWorkspaceState((state) => workspaceStateWithConversationDetail(state, detail, false));
          }
        })
        .catch((error) => console.warn('conversation title update skipped:', error));
    }
    updateWorldTaskState((state) => ({
      ...state,
      pendingTask,
    }), deployConvId);
    executeQuest(pendingTask, deployConvId).catch((error) => {
      // The failure belongs to the conversation that owns this pendingTask,
      // not whichever conversation is currently shown.
      const deployRuntime = getRuntime(deployConvId);
      if (deployRuntime && deployRuntime.activeRunId !== pendingTask.id) {
        return;
      }
      const deployAborted = deployRuntime ? deployRuntime.abortRequested : abortRef.current;
      if (deployAborted || error?.name === 'AbortError') {
        return;
      }
      console.error(error);
      const errorMessage = String(error?.message || error);
      const ownedTaskId = deployRuntime ? deployRuntime.activeTaskId : activeTaskIdRef.current;
      if (ownedTaskId) {
        chatFinalizedTaskIdsRef.current.add(ownedTaskId);
        updateTaskById(ownedTaskId, (task) => ({
          ...applyTerminalTaskState(task, 'failed', {
            error: errorMessage,
            aborted: false,
          }),
        }), deployConvId);
        updateWorldTaskState((state) => ({ ...state, activeTaskId: null }), deployConvId);
      } else {
        updateWorldTaskState((state) => ({
          ...state,
          pendingTask: state.pendingTask
            ? applyTerminalTaskState(state.pendingTask, 'failed', {
                error: errorMessage,
                aborted: false,
              })
            : null,
        }), deployConvId);
      }
      setRuntimeBusy(false, deployConvId);
      if (ownedTaskId) {
        dropPendingSceneItems(ownedTaskId);
      } else {
        dropPendingSceneItems();
      }
      resetSceneActors();
      if (ownedTaskId) {
        completeTaskAgents(ownedTaskId, 'failed');
      }
      setRuntimeActiveTaskId(null, deployConvId);
      setRuntimeActiveRunId(null, deployConvId);
      setRuntimeFetchController(null, deployConvId);
    });
  }

  function handleDeploy(text, attachment, modelId, reasoningEffort, imageAttachments, agentId, providerRequest) {
    const request = buildDeployRequest(text, attachment, modelId, reasoningEffort, imageAttachments, agentId, providerRequest);
    const deployConvId = conversationIdRef.current || conversationId;
    if (!canStartDeployForConversation(request.targetConversationId)) {
      setQueuedDeploy(request);
      return;
    }
    startDeploy(request, deployConvId);
  }

  async function handleSelectConversation(projectId, nextConversationId) {
    // Activation expands the project only. Conversation task lists are now
    // user-driven via the conversation icon, so selecting a conversation no
    // longer opens its tasks by default.
    const stampActivation = (state) => ({
      ...state,
      activeProjectId: projectId,
      activeConversationId: nextConversationId,
      projects: state.projects.map((project) => {
        if (project.id !== projectId) return project;
        const projectWithExpanded = { ...project, userExpanded: true };
        if (!nextConversationId) return projectWithExpanded;
        return {
          ...projectWithExpanded,
          conversations: project.conversations.map((conversation) => (
            conversation.id === nextConversationId
              ? { ...conversation, userExpanded: false }
              : conversation
          )),
        };
      }),
    });
    const currentConversationId = conversationIdRef.current || conversationId;
    if (!nextConversationId || nextConversationId === currentConversationId) {
      setWorkspaceState((state) => normalizeWorkspaceOrdering(stampActivation(state)));
      return;
    }
    const requestSeq = invalidateConversationActivation();
    setWorkspaceState((state) => normalizeWorkspaceOrdering(stampActivation(state)));
    activateConversationShell(projectId, nextConversationId);
    conversationDetailAbortRef.current?.abort?.();
    const detailController = new AbortController();
    conversationDetailAbortRef.current = detailController;
    try {
      const detail = await fetchConversationDetail(nextConversationId, { signal: detailController.signal });
      if (!isConversationActivationCurrent(requestSeq) || detailController.signal.aborted) return;
      await activateConversationDetail(detail, { activationSeq: requestSeq });
    } catch (error) {
      if (detailController.signal.aborted || error?.name === 'AbortError') return;
      if (isConversationActivationCurrent(requestSeq)) throw error;
    } finally {
      if (conversationDetailAbortRef.current === detailController) {
        conversationDetailAbortRef.current = null;
      }
    }
  }

  async function handleSelectProject(projectId) {
    const project = workspaceState.projects.find((item) => item.id === projectId);
    const executionMode = viewModeRef.current === 'chat' ? 'chat' : 'bot';
    const firstConversation = project?.conversations.find((item) => item.executionMode === executionMode);
    if (firstConversation) {
      await handleSelectConversation(projectId, firstConversation.id);
      return;
    }
    await handleAddConversation(projectId);
  }

  function handleToggleProject(projectId) {
    // Persist the user's explicit intent via `userExpanded`. The displayed
    // `expanded` is recomputed by withDefaultExpansion; we flip relative to
    // the currently displayed value so the click does what the user sees.
    setWorkspaceState((state) => normalizeWorkspaceOrdering({
      ...state,
      projects: state.projects.map((project) => (
        project.id === projectId ? { ...project, userExpanded: !project.expanded } : project
      )),
    }));
  }

  function handleToggleConversation(projectId, nextConversationId) {
    setWorkspaceState((state) => normalizeWorkspaceOrdering({
      ...state,
      projects: state.projects.map((project) => project.id === projectId ? {
        ...project,
        conversations: project.conversations.map((conversation) => (
          conversation.id === nextConversationId
            ? { ...conversation, userExpanded: !conversation.expanded }
            : conversation
        )),
      } : project),
    }));
  }

  function handleToggleConversationTasks(projectId, nextConversationId) {
    setWorkspaceState((state) => normalizeWorkspaceOrdering({
      ...state,
      projects: state.projects.map((project) => project.id === projectId ? {
        ...project,
        conversations: project.conversations.map((conversation) => (
          conversation.id === nextConversationId ? { ...conversation, tasksExpanded: !conversation.tasksExpanded } : conversation
        )),
      } : project),
    }));
  }

  function handlePinConversation(projectId, conversationId) {
    // Compute new pin state from current workspace so we can sync to backend
    const currentConversation = findConversationById(workspaceState, conversationId);
    const newPinned = !(currentConversation?.pinned ?? false);

    setWorkspaceState((state) => normalizeWorkspaceOrdering({
      ...state,
      projects: state.projects.map((project) => project.id === projectId ? {
        ...project,
        conversations: project.conversations.map((conversation) => (
          conversation.id === conversationId
            ? { ...conversation, pinned: newPinned }
            : conversation
        )),
      } : project),
    }));

    // Fire-and-forget sync to backend so pin survives server restart
    authFetch(`${API_BASE}/api/conversations/${encodeURIComponent(conversationId)}`, {
      method: 'PATCH',
      headers: buildApiHeaders(),
      body: JSON.stringify({ pinned: newPinned }),
    }).catch(() => {});
  }

  function handleReorderConversations(projectId, sourceId, targetId, position) {
    setWorkspaceState((state) => {
      const nextState = normalizeWorkspaceOrdering({
        ...state,
        projects: state.projects.map((project) => {
          if (project.id !== projectId) return project;
          const conversations = [...project.conversations];
          const sourceIdx = conversations.findIndex((c) => c.id === sourceId);
          if (sourceIdx === -1) return project;
          const [moved] = conversations.splice(sourceIdx, 1);
          let insertIdx;
          if (targetId === null) {
            insertIdx = conversations.length;
          } else {
            const adjustedTargetIdx = conversations.findIndex((c) => c.id === targetId);
            if (adjustedTargetIdx === -1) { conversations.splice(sourceIdx, 0, moved); return project; }
            insertIdx = position === 'after' ? adjustedTargetIdx + 1 : adjustedTargetIdx;
          }
          conversations.splice(insertIdx, 0, moved);
          return { ...project, conversations };
        }),
      });

      // Fire-and-forget sync to backend so manual order survives server restart
      const project = nextState.projects.find((p) => p.id === projectId);
      if (project) {
        const conversationIds = project.conversations.map((c) => c.id);
        authFetch(`${API_BASE}/api/conversations/reorder`, {
          method: 'PATCH',
          headers: buildApiHeaders(),
          body: JSON.stringify({ conversation_ids: conversationIds }),
        }).catch(() => {});
      }

      return nextState;
    });
  }

  function handlePinProject(projectId) {
    // Compute new pin state from current workspace so we can sync to backend
    const currentProject = workspaceState.projects.find((p) => p.id === projectId);
    const newPinned = !(currentProject?.pinned ?? false);

    setWorkspaceState((state) => normalizeWorkspaceOrdering({
      ...state,
      projects: state.projects.map((project) => (
        project.id === projectId
          ? { ...project, pinned: newPinned }
          : project
      )),
    }));

    // Sync all conversations in this project to backend as well
    if (currentProject) {
      for (const conversation of (currentProject.conversations || [])) {
        authFetch(`${API_BASE}/api/conversations/${encodeURIComponent(conversation.id)}`, {
          method: 'PATCH',
          headers: buildApiHeaders(),
          body: JSON.stringify({ pinned: newPinned }),
        }).catch(() => {});
      }
    }
  }

  function handleReorderProjects(sourceId, targetId, position) {
    setWorkspaceState((state) => normalizeWorkspaceOrdering({
      ...state,
      projects: (() => {
        const projects = [...state.projects];
        const sourceIdx = projects.findIndex((p) => p.id === sourceId);
        if (sourceIdx === -1) return state.projects;
        const [moved] = projects.splice(sourceIdx, 1);
        let insertIdx;
        if (targetId === null) {
          insertIdx = projects.length;
        } else {
          const adjustedTargetIdx = projects.findIndex((p) => p.id === targetId);
          if (adjustedTargetIdx === -1) { projects.splice(sourceIdx, 0, moved); return state.projects; }
          insertIdx = position === 'after' ? adjustedTargetIdx + 1 : adjustedTargetIdx;
        }
        projects.splice(insertIdx, 0, moved);
        return projects;
      })(),
    }));
  }

  async function createConversationInProject(project, title, executionMode = viewModeRef.current === 'chat' ? 'chat' : 'bot') {
    const createResponse = await authFetch(`${API_BASE}/api/conversations`, {
      method: 'POST',
      headers: buildApiHeaders(),
      body: JSON.stringify({ title, execution_mode: executionMode }),
    });
    if (!createResponse.ok) {
      throw new Error(`conversation create failed: ${createResponse.status}`);
    }
    let detail = await createResponse.json();
    if (project?.workspacePath) {
      const updateResponse = await authFetch(`${API_BASE}/api/conversations/${detail.conversation_id}`, {
        method: 'PATCH',
        headers: buildApiHeaders(),
        body: JSON.stringify({ workspace_path: project.workspacePath }),
      });
      if (!updateResponse.ok) {
        throw new Error(`conversation workspace assignment failed: ${updateResponse.status}`);
      }
      detail = await updateResponse.json();
    }
    return detail;
  }

  async function handleAddConversation(projectId) {
    const requestSeq = invalidateConversationActivation();
    const project = workspaceState.projects.find((item) => item.id === projectId) || workspaceState.projects[0];
    const detail = await createConversationInProject(project, project?.id === DEFAULT_PROJECT_ID ? DEFAULT_SESSION_NAME : 'New Conversation');
    if (!isConversationActivationCurrent(requestSeq)) return;
    await activateConversationDetail(detail, { restoreLatest: false });
  }

  async function handleAddProject() {
    const requestSeq = invalidateConversationActivation();
    if (window.haish?.pickProjectDirectory) {
      const pickResult = await window.haish.pickProjectDirectory();
      if (pickResult?.canceled || !pickResult?.project) {
        showToast('info', 'workspace selection cancelled');
        return;
      }
      const detail = await createConversationInProject({
        id: projectIdForWorkspacePath(pickResult.project.rootPath),
        type: 'custom',
        name: pickResult.project.name,
        workspacePath: pickResult.project.rootPath,
        workspaceLabel: pickResult.project.name,
      }, DEFAULT_SESSION_NAME);
      if (!isConversationActivationCurrent(requestSeq)) return;
      await activateConversationDetail(detail, { restoreLatest: false });
      showToast('success', `local workspace set: ${pickResult.project.name}`);
      return;
    }
    const createResponse = await authFetch(`${API_BASE}/api/conversations`, {
      method: 'POST',
      headers: buildApiHeaders(),
      body: JSON.stringify({
        title: DEFAULT_SESSION_NAME,
        execution_mode: viewModeRef.current === 'chat' ? 'chat' : 'bot',
      }),
    });
    if (!createResponse.ok) {
      throw new Error(`project conversation create failed: ${createResponse.status}`);
    }
    const created = await createResponse.json();
    const pickResponse = await authFetch(`${API_BASE}/api/conversations/${created.conversation_id}/workspace/pick`, {
      method: 'POST',
    });
    if (pickResponse.status === 409) {
      await authFetch(`${API_BASE}/api/conversations/${created.conversation_id}`, {
        method: 'DELETE',
      });
      showToast('info', 'workspace selection cancelled');
      return;
    }
    if (!pickResponse.ok) {
      throw new Error(`workspace pick failed: ${pickResponse.status}`);
    }
    const detail = await pickResponse.json();
    if (!detail.workspace_path) {
      await authFetch(`${API_BASE}/api/conversations/${created.conversation_id}`, {
        method: 'DELETE',
      });
      showToast('info', 'workspace selection cancelled');
      return;
    }
    if (!isConversationActivationCurrent(requestSeq)) return;
    await activateConversationDetail(detail, { restoreLatest: false });
  }

  async function handleDeleteConversation(projectId, nextConversationId) {
    const project = workspaceState.projects.find((item) => item.id === projectId);
    if (!project) return;
    const conversationToDelete = project.conversations.find((conversation) => conversation.id === nextConversationId) || null;
    await stopConversationRuntimeBeforeDelete(nextConversationId, conversationToDelete);
    const response = await authFetch(`${API_BASE}/api/conversations/${nextConversationId}`, {
      method: 'DELETE',
    });
    if (!response.ok && response.status !== 404) {
      throw new Error(`conversation delete failed: ${response.status}`);
    }
    const executionMode = viewModeRef.current === 'chat' ? 'chat' : 'bot';
    let fallbackConversation = project.conversations.find((conversation) => (
      conversation.id !== nextConversationId && conversation.executionMode === executionMode
    ));
    if (!fallbackConversation) {
      const detail = await createConversationInProject(project, project.id === DEFAULT_PROJECT_ID ? DEFAULT_SESSION_NAME : 'New Conversation');
      setWorkspaceState((state) => normalizeWorkspaceOrdering({
        ...state,
        projects: state.projects.map((item) => item.id === projectId ? {
          ...item,
          conversations: item.conversations.filter((conversation) => conversation.id !== nextConversationId),
        } : item),
      }));
      await activateConversationDetail(detail, { restoreLatest: false });
      return;
    }
    setWorkspaceState((state) => normalizeWorkspaceOrdering({
      ...state,
      projects: state.projects.map((item) => item.id === projectId ? {
        ...item,
        conversations: item.conversations.filter((conversation) => conversation.id !== nextConversationId),
      } : item),
    }));
    if (nextConversationId === conversationId) {
      await handleSelectConversation(projectId, fallbackConversation.id);
    }
  }

  async function handleRenameConversation(projectId, nextConversationId, title) {
    const trimmed = String(title || '').trim();
    if (!trimmed) return;
    const response = await authFetch(`${API_BASE}/api/conversations/${nextConversationId}`, {
      method: 'PATCH',
      headers: buildApiHeaders(),
      body: JSON.stringify({ title: trimmed }),
    });
    if (!response.ok) {
      throw new Error(`conversation rename failed: ${response.status}`);
    }
    const detail = await response.json();
    setWorkspaceState((state) => workspaceStateWithConversationDetail(state, detail, false));
    if (nextConversationId === conversationId) {
      applyConversationSnapshot(detail);
    }
  }

  async function handleRemoveProject(projectId) {
    const project = workspaceState.projects.find((item) => item.id === projectId);
    if (!project?.removable) return;
    await Promise.all(project.conversations.map((item) => stopConversationRuntimeBeforeDelete(item.id, item)));
    await Promise.all(project.conversations.map(async (item) => {
      const response = await authFetch(`${API_BASE}/api/conversations/${item.id}`, {
        method: 'DELETE',
      });
      if (!response.ok && response.status !== 404) {
        throw new Error(`conversation delete failed: ${response.status}`);
      }
    }));
    const nextState = normalizeWorkspaceOrdering({
      ...workspaceState,
      projects: workspaceState.projects.filter((item) => item.id !== projectId),
      activeProjectId: DEFAULT_PROJECT_ID,
      activeConversationId: null,
    });
    setWorkspaceState(nextState);
    const defaultProject = nextState.projects.find((item) => item.id === DEFAULT_PROJECT_ID) || createDefaultProject();
    const executionMode = viewModeRef.current === 'chat' ? 'chat' : 'bot';
    const fallbackConversation = defaultProject.conversations.find((item) => item.executionMode === executionMode);
    if (fallbackConversation) {
      const detail = await fetchConversationDetail(fallbackConversation.id);
      await activateConversationDetail(detail);
    } else {
      const detail = await createConversationInProject(defaultProject, DEFAULT_SESSION_NAME);
      await activateConversationDetail(detail, { restoreLatest: false });
    }
  }

  async function handleToggleViewMode() {
    const nextViewMode = viewModeRef.current === 'chat' ? 'world' : 'chat';
    const nextExecutionMode = nextViewMode === 'chat' ? 'chat' : 'bot';
    viewModeRef.current = nextViewMode;
    setViewMode(nextViewMode);
    setActiveTab('dashboard');

    const currentConversation = findConversationById(workspaceState, conversationIdRef.current);
    if (currentConversation?.executionMode === nextExecutionMode) return;
    const currentProject = findProjectByConversationId(workspaceState, conversationIdRef.current)
      || workspaceState.projects.find((project) => project.id === workspaceState.activeProjectId)
      || workspaceState.projects[0];
    const matchingConversation = currentProject?.conversations.find(
      (conversation) => conversation.executionMode === nextExecutionMode,
    );
    const detail = matchingConversation
      ? await fetchConversationDetail(matchingConversation.id)
      : await createConversationInProject(
          currentProject,
          currentProject?.id === DEFAULT_PROJECT_ID ? DEFAULT_SESSION_NAME : 'New Conversation',
          nextExecutionMode,
        );
    await activateConversationDetail(detail, { restoreLatest: Boolean(matchingConversation) });
  }

  function handleOpenTaskReport(task) {
    const restoredMode = task?.executionMode === 'bot' ? 'world' : 'chat';
    viewModeRef.current = restoredMode;
    setViewMode(restoredMode);
    const workflowNodes = Object.entries(task?.workflowRun?.nodes || {}).map(([nodeId, node]) => (
      `${node?.success === false ? '✕' : '✓'} ${nodeId}: ${node?.summary || node?.error || node?.status || ''}`
    ));
    const result = String(task?.answerText || workflowNodes.join('\n') || task?.error || '').trim();
    if (!result) return;
    setHollow({
      title: task?.title || 'Final Report',
      result,
      taskId: task?.taskId || task?.id || null,
    });
  }

  async function handleRetryTask(task) {
    const targetConversationId = task?.conversationId || task?.conversation_id;
    if (!targetConversationId) return;
    if (targetConversationId !== conversationIdRef.current) {
      const detail = await fetchConversationDetail(targetConversationId);
      await activateConversationDetail(detail, { restoreLatest: false });
    }
    const restoredMode = task?.executionMode === 'bot' ? 'world' : 'chat';
    viewModeRef.current = restoredMode;
    setViewMode(restoredMode);
    const selectionId = task?.executionMode === 'bot'
      ? task?.requestedWorkflowId
      : task?.requestedAgentId;
    const request = buildDeployRequest(
      task?.title || '',
      task?.attachment || null,
      task?.requestedModelId || '',
      task?.requestedReasoningEffort || 'high',
      task?.imageAttachments || [],
      selectionId,
      task?.requestedProvider || '',
    );
    request.targetConversationId = targetConversationId;
    if (canStartDeployForConversation(targetConversationId)) startDeploy(request, targetConversationId);
  }

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
    const deployConvId = queuedDeploy.targetConversationId || conversationIdRef.current || conversationId;
    if (!deployConvId) return;
    const request = queuedDeploy;
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
  const worldWorkflowActors = useMemo(
    () => workflowNodeActorBindings(worldWorkflow),
    [worldWorkflow],
  );
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
      // Cancelled tasks stay in chat history: if the LLM produced no streaming
      // output the agent bubble falls back to "Task was cancelled."; if it did
      // produce data the partial answer is shown. Either way the user message
      // is preserved so the conversation timeline doesn't disappear.
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
      const answer = String(task.answerText || '').trim();
      const progress = String(task.chatStreamText || '').trim();
      const error = String(task.error || '').trim();
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
      // Keep cancelled pending tasks visible without adding a synthetic
      // cancellation body; the elapsed/status UI carries that state.
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
                    modelOptions={modelOptions}
                    defaultModelId={defaultModelId}
                    modelLoading={providerLoading}
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
	                    overlay={<TaskDelegation onDeploy={handleDeploy} onStop={handleStop} onSelectFile={(file, selectedWorkflowId) => { handleAttachmentSelect(file, selectedWorkflowId, 'bot').catch((error) => console.error('attachment upload failed', error)); }} onClearFile={handleAttachmentClear} onSelectionChange={setSelectedWorkflowId} attachment={composerAttachment} uploading={uploadState.active} running={currentConversationRunning} disabled={composerDisabled} submitPending={submitPending} contextUsage={contextUsage} workspacePath={localWorkspace.path} homePath={window.haish?.homePath || ''} activeTaskText={activeTaskText} providerOptions={llmProviderOptions} modelOptions={modelOptions} defaultModelId={defaultModelId} modelLoading={providerLoading} agentOptions={workflowOptions} defaultAgentId={defaultWorkflowId} agentLoading={workflowLoading} agentLocked={false} agentLockedReason="" lockedAgentId="" selectionStorageKey={`${runConfigStorageKey}.bot`} />}
                  >
                    <div ref={stageRef} className="office-map">
                      {worldCalibrationActive && calibrationTarget === 'routes' && selectedRouteId && <CalibrationRoutePreview routeId={selectedRouteId} mapW={MAP_W} mapH={MAP_H} />}
                      {(worldCalibrationActive ? Object.keys(STATIONS).map((actor) => ({ actor, nodeId: actor, label: '' })) : worldWorkflowActors).map(({ actor, nodeId, label }) => <NPC key={nodeId} id={actor} state={npcStates[actor]} labelOverride={label} spriteConfig={getCharPoseConfig(actor)} mapW={MAP_W} mapH={MAP_H} showLabel={true} interactive={worldCalibrationActive && !busy && calibrationTarget === 'stations'} selected={worldCalibrationActive && ((selectedMarkerId === actor && calibrationTarget === 'stations') || (selectedPoseNpcId === actor && calibrationTarget === 'poses'))} showDebug={worldCalibrationActive && (calibrationTarget === 'stations' || (calibrationTarget === 'poses' && selectedPoseNpcId === actor))} debugText={calibrationTarget === 'poses' ? `${(npcStates[actor]?.poseDebug?.pose || 'idle').toUpperCase()} · ${(npcStates[actor]?.poseDebug?.dir || 'front').toUpperCase()}` : `${(stationDrafts[actor]?.x??0).toFixed(3)}, ${(stationDrafts[actor]?.y??0).toFixed(3)}`} onPointerDown={(npcId, e) => handleMarkerPointerDown('stations', npcId, e)} />)}
                      {worldCalibrationActive && calibrationTarget === 'routes' && activeIds.map((id, index) => <CalibrationPoint key={`${calibrationTarget}-${id}`} id={id} point={activeDrafts[id]} mapW={MAP_W} mapH={MAP_H} kind={resolvePointTarget(id)==='meet'?'meet':'nav'} selected={selectedMarkerId===id} showDebug={true} badgeText={index+1} onPointerDown={(pId, e) => handleMarkerPointerDown(calibrationTarget, pId, e)} />)}
                      <div className="fx-layer">{bursts.map(b => <div key={b.id} className="fx-ring" style={{ left: b.x, top: b.y, borderColor: b.color, boxShadow: `0 0 12px ${b.color}` }} />)}</div>
	                    </div>
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
