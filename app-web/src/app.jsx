// Main app — top bar / left task records / map viewport / right live feed /
// bottom delegation / bottom nav. Dashboard tab is the live one; other tabs
// are placeholders.

const { useState, useEffect, useRef, useMemo } = React;
const MAP_W = 1700;
const MAP_H = 950;
const CALIBRATION_NUDGE = 0.004;
const DEFAULT_WALK_SPEED_PX_PER_SEC = 220;
const WALK_SPEED_BY_ACTOR = {
  guts: 220,
};
const DEFAULT_WALK_MIN_DURATION_MS = 260;
const WALK_MIN_DURATION_BY_ACTOR = {
  guts: 210,
};
const SCENE_WAIT_TIMEOUT_MS = 45000;
const CONVERSATION_BOOTSTRAP_MAX_ATTEMPTS = 8;
const CONVERSATION_BOOTSTRAP_RETRY_DELAY_MS = 2000;
const THINKING_PULSE_INTERVAL_MS = 1000;
const POSE_DEBUG_DEFAULTS = { pose: 'idle', dir: 'front', movement: 'idle' };
const POSE_DEBUG_OPTIONS = [
  { key: 'idle', label: 'Idle' },
  { key: 'think', label: 'Think' },
  { key: 'busy', label: 'Busy' },
  { key: 'report', label: 'Report' },
  { key: 'llm', label: 'LLM' },
  { key: 'tool', label: 'Tool' },
  { key: 'mcp', label: 'MCP' },
  { key: 'skill', label: 'Skill' },
  { key: 'deliver', label: 'Deliver' },
];
const POSE_MAPPING_FIELDS = [
  { key: 'idle_front', label: 'Idle Front', type: 'idle', dir: 'front' },
  { key: 'idle_side', label: 'Idle Side', type: 'idle', dir: 'side' },
  { key: 'idle_back', label: 'Idle Back', type: 'idle', dir: 'back' },
  { key: 'walk_front', label: 'Walk Front', type: 'walk', dir: 'front' },
  { key: 'walk_side', label: 'Walk Side', type: 'walk', dir: 'side' },
  { key: 'walk_back', label: 'Walk Back', type: 'walk', dir: 'back' },
  { key: 'think', label: 'Think', type: 'pose' },
  { key: 'busy', label: 'Busy', type: 'pose' },
  { key: 'report', label: 'Report', type: 'pose' },
  { key: 'llm', label: 'LLM', type: 'pose' },
  { key: 'tool', label: 'Tool', type: 'pose' },
  { key: 'mcp', label: 'MCP', type: 'pose' },
  { key: 'skill', label: 'Skill', type: 'pose' },
  { key: 'deliver', label: 'Deliver', type: 'pose' },
];
const WORLD_ROLE_TO_ACTOR = {
  'User': 'gojo',
  'Agent Gateway': 'guts',
  'LLM Hub': 'okabe',
  'Provider Node': 'kurisu',
  'Tool Manager': 'lelouch',
  'Internal Tool Executor': 'levi',
  'External Tool Executor': 'itachi',
  'RAG Executor': 'mikey',
};

const WORLD_KIND_MAP = {
  gojo: 'deliver',
  guts: 'report',
  okabe: 'think',
  kurisu: 'llm',
  lelouch: 'deliver',
  levi: 'tool',
  itachi: 'mcp',
  mikey: 'skill',
};

const PROVIDER_ACTOR_MAP = {
  generic: { actor: 'okabe', label: 'Auto' },
  openai: { actor: 'okabe', label: 'OpenAI protocol' },
  deepseek: { actor: 'okabe', label: 'OpenAI protocol' },
  dashscope: { actor: 'okabe', label: 'OpenAI protocol' },
  qwen: { actor: 'okabe', label: 'OpenAI protocol' },
  zhipu: { actor: 'okabe', label: 'OpenAI protocol' },
  modelscope: { actor: 'okabe', label: 'OpenAI protocol' },
  moonshot: { actor: 'okabe', label: 'OpenAI protocol' },
  minimax: { actor: 'okabe', label: 'OpenAI protocol' },
  ollama: { actor: 'okabe', label: 'OpenAI protocol' },
  vllm: { actor: 'okabe', label: 'OpenAI protocol' },
  anthropic: { actor: 'kurisu', label: 'Anthropic protocol' },
  claude: { actor: 'kurisu', label: 'Anthropic protocol' },
};

const WORLD_EVENT_ROUTE_MAP = {
  'agent_gateway_received': { actor: 'guts', bubble: 'Task received. Selecting the provider.' },
  'tool_manager_received': { actor: 'lelouch', kind: 'deliver', bubble: 'Tool request received. Dispatching now.' },
  'tool_dispatched:levi': { actor: 'lelouch', route: 'lelouchToLevi', target: 'levi', kind: 'deliver', bubble: 'Local tools, take this task.' },
  'tool_dispatched:itachi': { actor: 'lelouch', route: 'lelouchToItachi', target: 'itachi', kind: 'deliver', bubble: 'External tools, execute this request.' },
  'tool_dispatched:skill': { actor: 'lelouch', route: 'lelouchToItachi', target: 'itachi', kind: 'deliver', bubble: 'Skill package, run this playbook.' },
  'tool_dispatched:mikey': { actor: 'lelouch', route: 'lelouchToMikey', target: 'mikey', kind: 'deliver', bubble: 'Knowledge base, retrieve the context.' },
  'tool_executor_completed:levi': { actor: 'levi', kind: 'tool', bubble: 'Local execution complete.' },
  'tool_executor_completed:itachi': { actor: 'itachi', kind: 'mcp', bubble: 'External execution complete.' },
  'tool_executor_completed:skill': { actor: 'itachi', kind: 'skill', bubble: 'Skill workflow step complete.' },
  'tool_executor_completed:mikey': { actor: 'mikey', kind: 'skill', bubble: 'Knowledge retrieval complete.' },
  'tool_result_returned': { actor: 'lelouch', route: 'lelouchToPlanning', target: 'okabe', kind: 'report', bubble: 'Tool results returned to the provider.' },
  'agent_gateway_reported': { actor: 'guts', route: 'gutsToGojo', target: 'gojo', kind: 'deliver', bubble: 'Reporting the final answer.' },
};

const WORLD_SCENE_EVENT_TYPES = new Set([
  'user_message_received',
  'agent_gateway_received',
  'provider_selected',
  'llm_thinking_started',
  'llm_thinking_completed',
  'llm_tool_call_requested',
  'tool_dispatched',
  'tool_executor_started',
  'tool_executor_completed',
  'tool_result_returned',
  'llm_final_answer',
  'agent_gateway_reported',
]);

const SCENE_CATCHUP_KEEP_TYPES = new Set([
  'tool_result_returned',
  'llm_final_answer',
  'agent_gateway_reported',
]);

const SCENE_TERMINAL_EVENT_TYPES = new Set([
  'llm_final_answer',
  'agent_gateway_reported',
  'run_finished',
  'run_error',
  'run_cancelled',
]);

const CHAT_FINAL_FOLLOWUP_EVENT_TYPES = new Set([
  'agent_gateway_reported',
  'run_finished',
  'run_error',
  'run_cancelled',
]);

const SCENE_CATCHUP_TOOL_EVENT_TYPES = new Set([
  'tool_manager_received',
  'tool_dispatched',
  'tool_executor_started',
  'tool_executor_completed',
  'tool_result_returned',
]);

const PROVIDER_SCENE_EVENT_TYPES = new Set([
  'provider_selected',
  'llm_thinking_started',
  'llm_thinking_completed',
  'llm_tool_call_requested',
  'llm_answer_delta',
  'llm_final_answer',
]);

const WORLD_EVENT_TYPE_ALIASES = {
  gateway_received: 'agent_gateway_received',
  gateway_reported: 'agent_gateway_reported',
};

const WORLD_EVENT_TAG_MAP = {
  user_message_received: 'RECEIVED',
  agent_gateway_received: 'THINKING',
  provider_selected: 'ROUTING',
  llm_thinking_started: 'THINKING',
  llm_thinking_completed: 'READY',
  llm_tool_call_requested: 'TOOL',
  tool_manager_received: 'RECEIVED',
  tool_dispatched: 'DISPATCH',
  tool_executor_started: 'EXECUTING',
  tool_executor_completed: 'COMPLETED',
  tool_result_returned: 'REPORT',
  llm_final_answer: 'ANSWER',
  agent_gateway_reported: 'REPORT',
};

const WORLD_KIND_TAG_MAP = {
  think: 'THINKING',
  llm: 'THINKING',
  tool: 'EXECUTING',
  mcp: 'EXECUTING',
  skill: 'EXECUTING',
  deliver: 'DELIVER',
  report: 'REPORT',
};

function getWorldEventTag(eventType, kind) {
  return WORLD_EVENT_TAG_MAP[eventType] || WORLD_KIND_TAG_MAP[kind] || 'WORKING';
}

function executorActorForToolGroup(toolGroup) {
  if (toolGroup === 'knowledge') return 'mikey';
  if (toolGroup === 'internal') return 'levi';
  if (toolGroup === 'external') return 'itachi';
  return null;
}

function sceneKeyForWorldEvent(event, executorActorId) {
  if (event.type === 'tool_dispatched' || event.type === 'tool_executor_completed') {
    if (event.tool_group === 'skill') return `${event.type}:skill`;
    return `${event.type}:${executorActorId || ''}`;
  }
  return event.type;
}

function defaultQuestDescription(text) {
  return text ? `Triggered by user input: ${text}` : 'Triggered by user input.';
}

function summarizeText(text, limit = 88) {
  const compact = String(text || '').replace(/\s+/g, ' ').trim();
  if (!compact) return '';
  return compact.length <= limit ? compact : `${compact.slice(0, limit - 3)}...`;
}

function toDisplayText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value.map((item) => toDisplayText(item)).filter(Boolean).join('\n');
  }
  if (typeof value === 'object') {
    if (typeof value.content === 'string') return value.content;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function skillDisplayName(event) {
  if (event?.skill_name) return `${event.skill_name} skill`;
  if (event?.skill_path) {
    const parts = String(event.skill_path).split('/').filter(Boolean);
    const markerIndex = parts.findIndex((part) => part === '.skills' || part === '.skills-src');
    if (markerIndex >= 0 && parts[markerIndex + 1]) return `${parts[markerIndex + 1]} skill`;
  }
  const text = `${event?.input_summary || ''} ${event?.output_summary || ''} ${event?.message || ''}`;
  const match = text.match(/(?:^|\s)\.skills(?:-src)?\/([^/\s"'`]+)\/SKILL\.md/i);
  return match ? `${match[1]} skill` : 'skill';
}

function skillLoadingBubble(event, providerMeta) {
  return `${providerMeta.label} loading ${skillDisplayName(event)}`;
}

function skillReadyBubble(event) {
  return event?.output_summary || `${skillDisplayName(event)} loaded. Skill context ready.`;
}

function normalizeWorldEvent(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const payload = raw.payload && typeof raw.payload === 'object' && !Array.isArray(raw.payload)
    ? raw.payload
    : {};
  const rawType = String(raw.type || payload.type || '').trim();
  const loopIndex = Number(raw.loop_index ?? payload.loop_index ?? 0);
  const timestamp = raw.created_at || raw.timestamp || payload.created_at || payload.timestamp || new Date().toISOString();
  return {
    ...payload,
    ...raw,
    type: WORLD_EVENT_TYPE_ALIASES[rawType] || rawType,
    event_id: raw.event_id || payload.event_id || null,
    task_id: raw.task_id || payload.task_id || null,
    conversation_id: raw.conversation_id || payload.conversation_id || null,
    loop_index: Number.isFinite(loopIndex) ? loopIndex : 0,
    actor: raw.actor ?? payload.actor ?? null,
    actor_id: raw.actor_id ?? payload.actor_id ?? null,
    executor_role: raw.executor_role ?? payload.executor_role ?? null,
    executor_actor_id: raw.executor_actor_id ?? payload.executor_actor_id ?? null,
    payload,
    created_at: raw.created_at || payload.created_at || timestamp,
    timestamp,
  };
}

function normalizeWorldEvents(events) {
  if (!Array.isArray(events)) return [];
  return events
    .map((event) => normalizeWorldEvent(event))
    .filter(Boolean);
}

function worldEventToRuntimeLog(event) {
  const deltaText = toDisplayText(event.delta ?? event.text ?? event.content_delta ?? '');
  return {
    type: event.type,
    timestamp: event.timestamp,
    actor: event.actor || null,
    target: event.target || null,
    callId: event.call_id || null,
    toolName: event.tool_name || null,
    toolGroup: event.tool_group || null,
    kind: event.kind || null,
    executorRole: event.executor_role || null,
    executorActorId: event.executor_actor_id || null,
    inputSummary: event.input_summary || '',
    outputSummary: event.output_summary || '',
    skillName: event.skill_name || '',
    skillPath: event.skill_path || '',
    provider: event.provider || null,
    providerKey: event.provider_key || null,
    model: event.model || null,
    reason: event.reason || '',
    usedTokens: event.used_tokens || null,
    totalTokens: event.total_tokens || null,
    selectedToolCount: event.selected_tool_count || null,
    estimatedTokens: event.estimated_tokens || null,
    compressed: Boolean(event.compressed),
    delta: deltaText,
    message: toDisplayText(event.message || event.delta || event.text || event.content_delta || event.content || null),
    loopIndex: event.loop_index || 0,
  };
}

function getLoopIndexFromWorldEvents(events) {
  return events.reduce((max, event) => Math.max(max, event.loop_index || 0), 0);
}

function getActiveRoleFromWorldEvents(events) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const actor = events[index]?.actor;
    if (actor) return actor;
  }
  return null;
}

function normalizeProviderKey(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'deepseek';
  if (normalized === 'auto' || normalized === 'generic' || normalized === 'default') return 'generic';
  if (normalized.includes('anthropic') || normalized.includes('claude')
      || normalized.includes('opus') || normalized.includes('sonnet') || normalized.includes('haiku')) {
    return 'anthropic';
  }
  if (normalized.includes('deepseek')) return 'deepseek';
  if (normalized.includes('openai') || normalized.includes('gpt')) return 'openai';
  if (normalized.includes('qwen') || normalized.includes('dashscope')) return 'dashscope';
  if (normalized.includes('glm') || normalized.includes('zhipu')) return 'zhipu';
  if (normalized.includes('kimi') || normalized.includes('moonshot')) return 'moonshot';
  if (normalized.includes('minimax')) return 'minimax';
  if (normalized.includes('gemini')) return 'gemini';
  if (normalized === 'local') return 'ollama';
  return normalized;
}

function resolveProviderMeta(...sources) {
  for (const source of sources) {
    if (!source) continue;
    const providerKey = normalizeProviderKey(source.provider_key || source.providerKey || source.requestedProvider);
    if (PROVIDER_ACTOR_MAP[providerKey]) return { key: providerKey, ...PROVIDER_ACTOR_MAP[providerKey] };
    const modelKey = normalizeProviderKey(source.model);
    if (PROVIDER_ACTOR_MAP[modelKey]) return { key: modelKey, ...PROVIDER_ACTOR_MAP[modelKey] };
    const providerNameKey = normalizeProviderKey(source.provider);
    if (PROVIDER_ACTOR_MAP[providerNameKey]) return { key: providerNameKey, ...PROVIDER_ACTOR_MAP[providerNameKey] };
  }
  return { key: 'deepseek', ...PROVIDER_ACTOR_MAP.deepseek };
}

function resolveApiBase() {
  const explicitBase = String(window.AGENT_WORLD_API_BASE || '').trim();
  if (explicitBase) return explicitBase.replace(/\/$/, '');
  return '';
}

const API_BASE = resolveApiBase();
const USER_STORAGE_KEY = 'agent_world_user_id';
const CONVERSATION_STORAGE_KEY = 'agent_world_conversation_id';
const WORKSPACE_STORAGE_KEY = 'agent_world_workspaces_v2';
const CONTEXT_USAGE_STORAGE_KEY = 'agent_world_context_usage_v1';
const DEFAULT_CONTEXT_TOTAL_TOKENS = 128000;
const RESTORED_CONTEXT_BASE_TOKENS = 4200;
const DEFAULT_PROJECT_ID = 'default-project';
const DEFAULT_PROJECT_NAME = 'Default project';
const DEFAULT_SESSION_NAME = 'Default Session';
const DEFAULT_CONVERSATION_NAMES = new Set([DEFAULT_SESSION_NAME, 'New Chat', 'Untitled Chat']);

function normalizeContextUsage(value, fallbackConversationId = null) {
  const usedTokens = Math.max(0, Math.round(Number(value?.usedTokens ?? value?.used_tokens ?? 0) || 0));
  const totalTokens = Math.max(1, Math.round(Number(value?.totalTokens ?? value?.total_tokens ?? value?.effective_budget ?? DEFAULT_CONTEXT_TOTAL_TOKENS) || DEFAULT_CONTEXT_TOTAL_TOKENS));
  const compressedCount = Math.max(0, Math.round(Number(value?.compressedCount ?? value?.compressed_count ?? 0) || 0));
  return {
    conversationId: value?.conversationId || value?.conversation_id || fallbackConversationId || null,
    usedTokens,
    totalTokens,
    ratio: Math.max(0, Math.min(1, totalTokens > 0 ? usedTokens / totalTokens : 0)),
    compressed: Boolean(value?.compressed) || compressedCount > 0 || usedTokens >= totalTokens,
    compressedCount,
    updatedAt: value?.updatedAt || value?.updated_at || null,
  };
}

function createEmptyContextUsage(conversationId = null) {
  return normalizeContextUsage({
    conversationId,
    usedTokens: 0,
    totalTokens: DEFAULT_CONTEXT_TOTAL_TOKENS,
  }, conversationId);
}

function loadStoredContextUsage(conversationId) {
  if (!conversationId) return createEmptyContextUsage(null);
  try {
    const raw = window.localStorage.getItem(CONTEXT_USAGE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return normalizeContextUsage(parsed?.[conversationId] || null, conversationId);
  } catch (error) {
    console.warn('Failed to load context usage:', error);
    return createEmptyContextUsage(conversationId);
  }
}

function saveStoredContextUsage(usage) {
  if (!usage?.conversationId) return;
  try {
    const raw = window.localStorage.getItem(CONTEXT_USAGE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    parsed[usage.conversationId] = usage;
    window.localStorage.setItem(CONTEXT_USAGE_STORAGE_KEY, JSON.stringify(parsed));
  } catch (error) {
    console.warn('Failed to save context usage:', error);
  }
}

function estimateTextTokens(text) {
  const value = String(text || '').trim();
  if (!value) return 0;
  let cjk = 0;
  let latin = 0;
  for (const char of value) {
    if (/[\u3400-\u9fff\uf900-\ufaff]/u.test(char)) cjk += 1;
    else if (!/\s/u.test(char)) latin += 1;
  }
  return Math.ceil(cjk + (latin / 4));
}

function estimateContextUsageFromConversationDetail(detail) {
  if (!detail?.conversation_id) return createEmptyContextUsage(null);
  const messages = Array.isArray(detail.messages) ? detail.messages : [];
  const tasks = Array.isArray(detail.tasks) ? detail.tasks : [];
  let usedTokens = messages.reduce((total, message) => (
    total + estimateTextTokens(message?.content) + 24
  ), 0);
  usedTokens += tasks.reduce((total, task) => (
    total
    + estimateTextTokens(task?.title)
    + estimateTextTokens(task?.description)
    + estimateTextTokens(task?.answer_text)
    + 16
  ), 0);
  if (usedTokens > 0) usedTokens += RESTORED_CONTEXT_BASE_TOKENS;
  return normalizeContextUsage({
    conversationId: detail.conversation_id,
    usedTokens,
    totalTokens: DEFAULT_CONTEXT_TOTAL_TOKENS,
  }, detail.conversation_id);
}

function mergeContextUsage(primary, fallback) {
  const normalizedPrimary = normalizeContextUsage(primary, fallback?.conversationId || null);
  const normalizedFallback = normalizeContextUsage(fallback, normalizedPrimary.conversationId);
  return normalizedPrimary.usedTokens >= normalizedFallback.usedTokens
    ? normalizedPrimary
    : normalizedFallback;
}

function generateHexId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID().replace(/-/g, '');
  }
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 18)}`;
}

function getOrCreateUserId() {
  const existing = String(window.localStorage.getItem(USER_STORAGE_KEY) || '').trim();
  if (existing) return existing;
  const next = generateHexId();
  window.localStorage.setItem(USER_STORAGE_KEY, next);
  return next;
}

function getStoredConversationId() {
  return String(window.localStorage.getItem(CONVERSATION_STORAGE_KEY) || '').trim() || null;
}

function setStoredConversationId(conversationId) {
  if (!conversationId) {
    window.localStorage.removeItem(CONVERSATION_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(CONVERSATION_STORAGE_KEY, conversationId);
}

function createDefaultProject() {
  return {
    id: DEFAULT_PROJECT_ID,
    type: 'system',
    name: DEFAULT_PROJECT_NAME,
    workspacePath: null,
    workspaceLabel: null,
    removable: false,
    expanded: true,
    conversations: [],
  };
}

function createEmptyWorkspaceState() {
  return {
    projects: [createDefaultProject()],
    activeProjectId: DEFAULT_PROJECT_ID,
    activeConversationId: null,
  };
}

function loadStoredWorkspaceState() {
  try {
    const raw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (!raw) return createEmptyWorkspaceState();
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.projects)) return createEmptyWorkspaceState();
    const defaultProject = createDefaultProject();
    const projectsById = new Map(parsed.projects.map((project) => [project.id, project]));
    const projects = [
      projectsById.get(DEFAULT_PROJECT_ID) || defaultProject,
      ...parsed.projects.filter((project) => project.id !== DEFAULT_PROJECT_ID),
    ].map((project) => {
      const isDefault = project.id === DEFAULT_PROJECT_ID;
      return {
        ...project,
        type: isDefault ? 'system' : 'custom',
        name: isDefault ? DEFAULT_PROJECT_NAME : (project.name || project.workspaceLabel || 'Custom project'),
        workspacePath: isDefault ? null : (project.workspacePath || null),
        workspaceLabel: isDefault ? null : (project.workspaceLabel || project.name || null),
        removable: !isDefault,
        expanded: project.expanded !== false,
        conversations: Array.isArray(project.conversations)
          ? project.conversations.map((conversation) => ({
            id: conversation.id,
            name: conversation.name || DEFAULT_SESSION_NAME,
            tasks: Array.isArray(conversation.tasks) ? conversation.tasks : [],
            expanded: conversation.expanded !== false,
            tasksExpanded: Boolean(conversation.tasksExpanded),
          })).filter((conversation) => conversation.id)
          : [],
      };
    });
    return {
      projects,
      activeProjectId: parsed.activeProjectId || DEFAULT_PROJECT_ID,
      activeConversationId: parsed.activeConversationId || getStoredConversationId(),
    };
  } catch (error) {
    console.warn('Failed to load workspace state:', error);
    return createEmptyWorkspaceState();
  }
}

function saveWorkspaceState(state) {
  try {
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Failed to save workspace state:', error);
  }
}

function getWorkspaceConversationIds(state) {
  return (state?.projects || [])
    .flatMap((project) => project.conversations || [])
    .map((conversation) => conversation.id)
    .filter(Boolean);
}

function projectIdForWorkspacePath(workspacePath) {
  const raw = String(workspacePath || '').trim();
  return raw ? `workspace:${encodeURIComponent(raw)}` : DEFAULT_PROJECT_ID;
}

function projectNameFromPath(workspacePath, fallback = 'Custom project') {
  const raw = String(workspacePath || '').trim();
  if (!raw) return fallback;
  const parts = raw.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || fallback;
}

function isDefaultConversationName(name) {
  const normalized = String(name || '').trim();
  return DEFAULT_CONVERSATION_NAMES.has(normalized) || /^New Chat \d+$/.test(normalized);
}

function titleFromTaskText(text, maxLength = 48) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function conversationDetailToWorkspaceConversation(detail, previousConversation = null) {
  return {
    id: detail.conversation_id,
    name: detail.title || detail.label || DEFAULT_SESSION_NAME,
    tasks: Array.isArray(detail.tasks) ? detail.tasks.map(taskSummaryToRuntimeTask) : [],
    expanded: previousConversation?.expanded !== false,
    tasksExpanded: Boolean(previousConversation?.tasksExpanded),
  };
}

function buildWorkspaceStateFromConversationDetails(details, previousState) {
  const previous = previousState || createEmptyWorkspaceState();
  const previousProjects = new Map(previous.projects.map((project) => [project.id, project]));
  const previousConversations = new Map(
    previous.projects.flatMap((project) => project.conversations.map((conversation) => [conversation.id, conversation]))
  );
  const projectsById = new Map();
  projectsById.set(DEFAULT_PROJECT_ID, {
    ...(previousProjects.get(DEFAULT_PROJECT_ID) || createDefaultProject()),
    id: DEFAULT_PROJECT_ID,
    type: 'system',
    name: DEFAULT_PROJECT_NAME,
    workspacePath: null,
    workspaceLabel: null,
    removable: false,
    conversations: [],
  });

  for (const detail of details) {
    if (!detail?.conversation_id) continue;
    const workspacePath = String(detail.workspace_path || '').trim();
    const projectId = projectIdForWorkspacePath(workspacePath);
    if (!projectsById.has(projectId)) {
      const previousProject = previousProjects.get(projectId);
      const label = detail.workspace_label || projectNameFromPath(workspacePath);
      projectsById.set(projectId, {
        id: projectId,
        type: 'custom',
        name: previousProject?.name || label,
        workspacePath,
        workspaceLabel: label,
        removable: true,
        expanded: previousProject?.expanded !== false,
        conversations: [],
      });
    }
    const project = projectsById.get(projectId);
    project.conversations.push(
      conversationDetailToWorkspaceConversation(detail, previousConversations.get(detail.conversation_id))
    );
  }

  const projects = Array.from(projectsById.values()).filter((project) => (
    project.id === DEFAULT_PROJECT_ID || project.conversations.length > 0
  ));
  const activeConversationExists = projects.some((project) => (
    project.conversations.some((conversation) => conversation.id === previous.activeConversationId)
  ));
  const fallbackProject = projects.find((project) => project.conversations.length > 0) || projects[0] || createDefaultProject();
  const activeConversationId = activeConversationExists
    ? previous.activeConversationId
    : fallbackProject.conversations[0]?.id || null;
  const activeProject = projects.find((project) => (
    project.conversations.some((conversation) => conversation.id === activeConversationId)
  )) || fallbackProject;

  return {
    projects,
    activeProjectId: activeProject.id,
    activeConversationId,
  };
}

function workspaceStateWithConversationDetail(state, detail, activate = true) {
  const workspacePath = String(detail?.workspace_path || '').trim();
  const projectId = projectIdForWorkspacePath(workspacePath);
  const projectLabel = detail?.workspace_label || projectNameFromPath(workspacePath);
  let projectFound = false;
  let conversationFound = false;
  const projects = state.projects.map((project) => {
    if (project.id !== projectId) return project;
    projectFound = true;
    const conversations = project.conversations.map((conversation) => {
      if (conversation.id !== detail.conversation_id) return conversation;
      conversationFound = true;
      return conversationDetailToWorkspaceConversation(detail, conversation);
    });
    return {
      ...project,
      workspacePath: projectId === DEFAULT_PROJECT_ID ? null : workspacePath,
      workspaceLabel: projectId === DEFAULT_PROJECT_ID ? null : projectLabel,
      expanded: true,
      conversations: conversationFound
        ? conversations
        : [...conversations, conversationDetailToWorkspaceConversation(detail)],
    };
  });
  if (!projectFound) {
    projects.push({
      id: projectId,
      type: projectId === DEFAULT_PROJECT_ID ? 'system' : 'custom',
      name: projectId === DEFAULT_PROJECT_ID ? DEFAULT_PROJECT_NAME : projectLabel,
      workspacePath: projectId === DEFAULT_PROJECT_ID ? null : workspacePath,
      workspaceLabel: projectId === DEFAULT_PROJECT_ID ? null : projectLabel,
      removable: projectId !== DEFAULT_PROJECT_ID,
      expanded: true,
      conversations: [conversationDetailToWorkspaceConversation(detail)],
    });
  }
  return {
    projects,
    activeProjectId: activate ? projectId : state.activeProjectId,
    activeConversationId: activate ? detail.conversation_id : state.activeConversationId,
  };
}

function findProjectByConversationId(state, conversationId) {
  return state.projects.find((project) => (
    project.conversations.some((conversation) => conversation.id === conversationId)
  )) || null;
}

function buildApiHeaders() {
  return {
    'Content-Type': 'application/json',
    'X-Agent-User-Id': getOrCreateUserId(),
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createConversationWithRetry(payload, isCurrentActivation) {
  let lastStatus = null;
  for (let attempt = 1; attempt <= CONVERSATION_BOOTSTRAP_MAX_ATTEMPTS; attempt += 1) {
    if (!isCurrentActivation()) return null;
    const response = await fetch(`${API_BASE}/api/conversations`, {
      method: 'POST',
      headers: buildApiHeaders(),
      body: JSON.stringify(payload),
    });
    if (response.ok) return response.json();
    lastStatus = response.status;
    if (response.status !== 503 || attempt === CONVERSATION_BOOTSTRAP_MAX_ATTEMPTS) {
      break;
    }
    await sleep(CONVERSATION_BOOTSTRAP_RETRY_DELAY_MS);
  }
  throw new Error(`conversation bootstrap failed: ${lastStatus || 'unknown'}`);
}

function createEmptyWorldTaskState() {
  return {
    activeTaskId: null,
    pendingTask: null,
    taskOrder: [],
    tasksById: {},
  };
}

function normalizeTaskStatus(status) {
  if (status === 'aborted') return 'cancelled';
  if (status === 'completed') return 'done';
  return status || 'queued';
}

function isTerminalTaskStatus(status) {
  const normalized = normalizeTaskStatus(status);
  return normalized === 'done' || normalized === 'failed' || normalized === 'cancelled';
}

function applyTerminalTaskState(task, status, options = {}) {
  if (!task) return task;
  const normalized = normalizeTaskStatus(status);
  const now = Date.now();
  return {
    ...task,
    status: normalized,
    stage: 'done',
    completedAt: task.completedAt || now,
    error: options.error ?? task.error ?? null,
    aborted: options.aborted ?? task.aborted ?? normalized === 'cancelled',
    presentationPending: false,
    sceneCatchup: false,
    serverFinished: true,
  };
}

function sortTaskIdsForRestore(tasks, lastTaskId) {
  const ordered = tasks.map((task) => task.task_id);
  if (!lastTaskId || !ordered.includes(lastTaskId)) return ordered;
  return [...ordered.filter((taskId) => taskId !== lastTaskId), lastTaskId];
}

function createPendingTaskDraft(text, attachment) {
  return {
    title: text,
    description: defaultQuestDescription(text),
    createdAt: Date.now(),
    stage: 'assigned',
    status: 'queued',
    assignedTo: 'guts',
    assignedToLabel: 'Assistant',
    requestedProvider: 'auto',
    attachment: attachment ? { ...attachment } : null,
    originViewMode: 'world',
  };
}

function buildWorldTaskRecord(event, pendingTask) {
  return {
    taskId: event.task_id,
    conversationId: event.conversation_id || null,
    title: pendingTask?.title || event.message || 'Task',
    description: pendingTask?.description || defaultQuestDescription(pendingTask?.title || event.message || ''),
    status: 'queued',
    stage: 'assigned',
    createdAt: pendingTask?.createdAt || Date.now(),
    completedAt: null,
    assignedTo: 'guts',
    assignedToLabel: 'Assistant',
    attachment: pendingTask?.attachment || null,
    attachments: pendingTask?.attachment ? [{ ...pendingTask.attachment }] : [],
    loopIndex: Math.max(0, event.loop_index || 0),
    activeRole: event.actor || null,
    provider: null,
    providerKey: pendingTask?.requestedProvider || 'auto',
    requestedProvider: pendingTask?.requestedProvider || 'auto',
    originViewMode: pendingTask?.originViewMode || 'world',
    providerState: pendingTask?.requestedProvider ? {
      provider: pendingTask.requestedProvider,
      state: 'selected',
      selected: pendingTask.requestedProvider !== 'auto',
      reason: 'Selected from the page.',
      model: null,
    } : null,
    answerText: '',
    chatStreamText: '',
    toolCalls: [],
    eventLog: [],
    sources: [],
    memory: [],
    error: null,
    presentationPending: false,
    serverFinished: false,
    sceneCatchup: false,
  };
}

function taskSummaryToRuntimeTask(task) {
  const taskAttachments = Array.isArray(task.attachments)
    ? task.attachments.map((attachment) => ({ ...attachment, uploaded: true }))
    : [];
  return {
    taskId: task.task_id,
    conversationId: task.conversation_id,
    title: task.title,
    description: task.description,
    status: task.status,
    stage: task.stage,
    createdAt: task.created_at ? Date.parse(task.created_at) || Date.now() : Date.now(),
    completedAt: task.completed_at ? Date.parse(task.completed_at) || null : null,
    assignedTo: 'guts',
    assignedToLabel: 'Assistant',
    attachment: taskAttachments[0] || null,
    attachments: taskAttachments,
    loopIndex: 0,
    activeRole: null,
    provider: task.provider,
    providerKey: task.provider_key || 'auto',
    requestedProvider: task.provider_key || 'auto',
    providerState: task.provider || task.provider_key ? {
      provider: task.provider || task.provider_key,
      state: 'selected',
      selected: true,
      reason: 'Restored from conversation history.',
      model: task.model || null,
    } : null,
    answerText: task.answer_text || '',
    chatStreamText: '',
    toolCalls: [],
    eventLog: [],
    sources: Array.isArray(task.sources) ? task.sources : [],
    memory: Array.isArray(task.memory) ? task.memory : [],
    error: task.error || null,
    presentationPending: false,
    serverFinished: task.status === 'done' || task.status === 'failed' || task.status === 'cancelled',
    sceneCatchup: false,
  };
}

function taskDetailToRuntimeTask(task, previousTask = null) {
  const events = normalizeWorldEvents(task.events);
  const nextTask = {
    ...(previousTask || taskSummaryToRuntimeTask(task)),
    ...taskSummaryToRuntimeTask(task),
    loopIndex: getLoopIndexFromWorldEvents(events),
    activeRole: getActiveRoleFromWorldEvents(events),
    eventLog: events.map(worldEventToRuntimeLog),
  };
  return nextTask;
}

function buildAgentLiveSnapshot(task, events) {
  const next = {};
  const providerMeta = resolveProviderMeta(task);
  for (const event of events) {
    if (!WORLD_SCENE_EVENT_TYPES.has(event.type)) continue;
    const actorId = event.actor_id || WORLD_ROLE_TO_ACTOR[event.actor];
    const executorActorId = event.executor_actor_id || executorActorForToolGroup(event.tool_group);
    const sceneKey = sceneKeyForWorldEvent(event, executorActorId);
    const routeConfig = WORLD_EVENT_ROUTE_MAP[sceneKey] || WORLD_EVENT_ROUTE_MAP[event.type];
    const actor = PROVIDER_SCENE_EVENT_TYPES.has(event.type)
      ? providerMeta.actor
      : event.tool_group === 'skill'
        ? providerMeta.actor
      : routeConfig?.actor || actorId;
    if (!actor || !window.STATIONS[actor]) continue;
    const bubble = event.type === 'provider_selected'
      ? providerMeta.label
      : event.message || event.delta || routeConfig?.bubble || '';
    const kind = event.kind || routeConfig?.kind || WORLD_KIND_MAP[actor] || 'deliver';
    next[actor] = mergeAgentLiveEntry(next[actor], {
      taskId: task.task_id || task.taskId,
      description: summarizeText(bubble || event.content || event.tool_name || event.type),
      stepCurrent: Math.max(1, event.loop_index || 1),
      stepTotal: Math.max(1, event.loop_index || 1),
      tag: getWorldEventTag(event.type, kind),
      kind,
      ts: Date.parse(event.timestamp) || Date.now(),
      status: getLiveEventStatus(event.type),
    });
  }
  if (task.status === 'done' || task.status === 'failed' || task.status === 'cancelled') {
    const outcome = normalizeTaskStatus(task.status);
    for (const actor of Object.keys(next)) {
      next[actor] = completeAgentLiveEntries(next[actor], task.task_id || task.taskId, outcome);
    }
  }
  return next;
}

function getLiveEventStatus(eventType) {
  if (eventType === 'agent_gateway_received'
    || eventType === 'llm_thinking_started'
    || eventType === 'llm_tool_call_requested'
    || eventType === 'tool_manager_received'
    || eventType === 'tool_dispatched'
    || eventType === 'tool_executor_started') {
    return 'pending';
  }
  return 'done';
}

function normalizeLiveEntryStatus(status, outcome, completed) {
  const normalizedOutcome = normalizeTaskStatus(outcome);
  if (normalizedOutcome === 'failed') return 'failed';
  if (normalizedOutcome === 'cancelled') return 'cancelled';
  if (normalizedOutcome === 'done') return 'done';
  if (status === 'failed' || status === 'cancelled' || status === 'done' || status === 'pending') return status;
  return completed ? 'done' : 'pending';
}

function legacyLiveEntries(agentState) {
  if (!agentState) return [];
  if (Array.isArray(agentState.entries)) return agentState.entries;
  if (!agentState.description && !agentState.tag) return [];
  return [{
    id: agentState.id || `${agentState.taskId || 'task'}:${agentState.ts || Date.now()}:legacy`,
    taskId: agentState.taskId,
    description: agentState.description || '',
    stepCurrent: agentState.stepCurrent || 1,
    stepTotal: agentState.stepTotal || 1,
    tag: agentState.tag || 'WORKING',
    kind: agentState.kind || 'info',
    ts: agentState.ts || Date.now(),
    status: normalizeLiveEntryStatus(agentState.status, agentState.outcome, agentState.completed),
    outcome: agentState.outcome,
  }];
}

function mergeAgentLiveEntry(agentState, payload) {
  const ts = payload.ts || Date.now();
  const entries = legacyLiveEntries(agentState);
  const id = payload.entryKey || `${payload.taskId || 'task'}:${ts}:${entries.length}`;
  const status = normalizeLiveEntryStatus(payload.status, payload.outcome, payload.completed);
  const entry = {
    id,
    taskId: payload.taskId,
    description: payload.description || '',
    stepCurrent: payload.stepCurrent || 1,
    stepTotal: payload.stepTotal || 1,
    tag: payload.tag || 'WORKING',
    kind: payload.kind || 'info',
    ts,
    status,
    outcome: payload.outcome,
  };
  const settledEntries = entries.map((item) => (
    item.taskId === entry.taskId && item.id !== id && item.status === 'pending'
      ? { ...item, status: 'done', outcome: item.outcome || 'done' }
      : item
  ));
  const existingIndex = settledEntries.findIndex((item) => item.id === id);
  const nextEntries = existingIndex >= 0
    ? settledEntries.map((item, index) => (index === existingIndex ? { ...item, ...entry } : item))
    : [...settledEntries, entry];
  const trimmedEntries = nextEntries
    .sort((a, b) => a.ts - b.ts)
    .slice(-80);
  return {
    ...(agentState || {}),
    ...payload,
    ts,
    completed: entry.status !== 'pending',
    outcome: payload.outcome,
    status: entry.status,
    entries: trimmedEntries,
  };
}

function completeAgentLiveEntries(agentState, taskId, outcome = 'done') {
  const normalizedOutcome = normalizeTaskStatus(outcome);
  const status = normalizedOutcome === 'failed'
    ? 'failed'
    : normalizedOutcome === 'cancelled'
      ? 'cancelled'
      : normalizedOutcome === 'done'
        ? 'done'
        : 'pending';
  const entries = legacyLiveEntries(agentState).map((entry) => (
    entry.taskId === taskId
      ? { ...entry, status, outcome: normalizedOutcome }
      : entry
  ));
  return {
    ...(agentState || {}),
    completed: status !== 'pending',
    outcome: normalizedOutcome,
    status,
    ts: Date.now(),
    entries,
  };
}

function completeLatestAgentLiveEntry(agentState, taskId, outcome = 'done') {
  const entries = legacyLiveEntries(agentState);
  const index = entries
    .map((entry, entryIndex) => ({ entry, entryIndex }))
    .filter(({ entry }) => entry.taskId === taskId && entry.status === 'pending')
    .sort((a, b) => (b.entry.ts || 0) - (a.entry.ts || 0))[0]?.entryIndex;
  if (index == null) return agentState;
  const normalizedOutcome = normalizeTaskStatus(outcome);
  const status = normalizedOutcome === 'failed'
    ? 'failed'
    : normalizedOutcome === 'cancelled'
      ? 'cancelled'
      : 'done';
  return {
    ...(agentState || {}),
    completed: true,
    outcome: normalizedOutcome,
    status,
    ts: Date.now(),
    entries: entries.map((entry, entryIndex) => (
      entryIndex === index ? { ...entry, status, outcome: normalizedOutcome } : entry
    )),
  };
}

function upsertToolCall(toolCalls, callId, patch) {
  if (!callId) return toolCalls;
  const index = toolCalls.findIndex((item) => item.callId === callId);
  if (index < 0) {
    return [...toolCalls, { callId, ...patch }];
  }
  const next = toolCalls.slice();
  next[index] = { ...next[index], ...patch };
  return next;
}

function runtimeTaskToQuest(task) {
  return {
    id: task.taskId,
    title: task.title,
    description: task.description,
    status: task.status,
    stepIdx: task.loopIndex || 0,
    totalSteps: task.loopIndex || 0,
    createdAt: task.createdAt,
    completedAt: task.completedAt,
    stage: task.stage,
    assignedTo: task.assignedTo,
    assignedToLabel: task.assignedToLabel,
    taskId: task.taskId,
    provider: task.provider,
    requestedProvider: task.requestedProvider,
    answerText: task.answerText || '',
  };
}

function getChatProgressLine(event) {
  const toolName = event.tool_name || event.toolName || 'tool';
  switch (event.type) {
    case 'user_message_received':
      return 'Task received.';
    case 'agent_gateway_received':
      return 'Preparing the agent route.';
    case 'provider_selected':
      return `Model selected: ${event.provider || event.provider_key || 'auto'}.`;
    case 'llm_thinking_started':
      return 'Assistant is reasoning.';
    case 'llm_thinking_completed':
      return 'Reasoning step complete.';
    case 'llm_tool_call_requested':
      return `Tool requested: ${toolName}.`;
    case 'tool_manager_received':
      return 'Tool Manager received the request.';
    case 'tool_dispatched':
      return `Dispatching ${toolName}.`;
    case 'tool_executor_started':
      return `Running ${toolName}.`;
    case 'tool_executor_completed':
      return `${toolName} completed.`;
    case 'tool_result_returned':
      return event.output_summary || event.message || `${toolName} result returned.`;
    default:
      return '';
  }
}

function appendChatProgressText(current, line) {
  const nextLine = String(line || '').trim();
  if (!nextLine) return current || '';
  const existing = String(current || '').trimEnd();
  const lines = existing ? existing.split('\n').filter(Boolean) : [];
  if (lines[lines.length - 1] === nextLine) return existing;
  return [...lines, nextLine].slice(-12).join('\n');
}

function appendAnswerDelta(current, delta) {
  const existing = String(current || '');
  const nextDelta = String(delta || '');
  if (!nextDelta) return existing;
  if (!existing) return nextDelta;
  if (existing.endsWith(nextDelta)) return existing;
  if (nextDelta.startsWith(existing)) return nextDelta;
  const maxOverlap = Math.min(existing.length, nextDelta.length);
  for (let size = maxOverlap; size > 0; size -= 1) {
    if (existing.slice(-size) === nextDelta.slice(0, size)) {
      return existing + nextDelta.slice(size);
    }
  }
  return existing + nextDelta;
}

function eventDeltaText(event) {
  return String(event?.delta ?? event?.text ?? event?.contentDelta ?? event?.content_delta ?? event?.message ?? '');
}

function chatTraceToolName(value) {
  return String(value || 'tool').replace(/[_-]+/g, ' ').trim() || 'tool';
}

function isSubAgentTraceItem(item) {
  const name = String(item?.toolName || item?.tool_name || '').toLowerCase();
  return name.includes('dispatch_sub_agent') || name.includes('sub_agent') || name.includes('subagent');
}

function isSkillTraceItem(item) {
  const group = String(item?.toolGroup || item?.tool_group || '').toLowerCase();
  const kind = String(item?.kind || '').toLowerCase();
  return group === 'skill' || group === 'knowledge' || kind === 'skill' || Boolean(item?.skillName || item?.skill_name || item?.skillPath || item?.skill_path);
}

function isMcpTraceItem(item) {
  const group = String(item?.toolGroup || item?.tool_group || '').toLowerCase();
  const kind = String(item?.kind || '').toLowerCase();
  const role = String(item?.executorRole || item?.executor_role || '').toLowerCase();
  return group === 'external' || kind === 'mcp' || role.includes('external tool');
}

function getToolTraceSection(item) {
  if (isSubAgentTraceItem(item)) return 'subagents';
  if (isSkillTraceItem(item)) return 'skills';
  if (isMcpTraceItem(item)) return 'mcp';
  return 'tools';
}

function getToolTraceStatus(state, fallbackStatus = 'running') {
  const normalized = String(state || '').toLowerCase();
  if (normalized === 'returned' || normalized === 'completed' || normalized === 'done') return 'done';
  if (normalized === 'failed' || normalized === 'error') return 'failed';
  if (normalized === 'running' || normalized === 'dispatched' || normalized === 'received' || normalized === 'requested') return 'running';
  const fallback = normalizeTaskStatus(fallbackStatus);
  if (fallback === 'done') return 'done';
  if (fallback === 'failed') return 'failed';
  return 'pending';
}

function formatTraceTokens(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return '';
  if (number >= 1000) return `${(number / 1000).toFixed(number >= 10000 ? 0 : 1)}k`;
  return String(Math.round(number));
}

function pushTraceItem(sectionMap, sectionId, item) {
  if (!sectionMap[sectionId]) return;
  const nextItem = {
    id: item.id || `${sectionId}-${sectionMap[sectionId].items.length}`,
    label: item.label || '',
    summary: item.summary || '',
    meta: item.meta || '',
    status: item.status || 'pending',
  };
  if (!nextItem.label && !nextItem.summary) return;
  sectionMap[sectionId].items.push(nextItem);
}

function upsertTraceItem(sectionMap, sectionId, item) {
  if (!sectionMap[sectionId]) return;
  const itemId = item.id || `${sectionId}-${sectionMap[sectionId].items.length}`;
  const existingIndex = sectionMap[sectionId].items.findIndex((entry) => entry.id === itemId);
  if (existingIndex < 0) {
    pushTraceItem(sectionMap, sectionId, { ...item, id: itemId });
    return;
  }
  sectionMap[sectionId].items[existingIndex] = {
    ...sectionMap[sectionId].items[existingIndex],
    ...item,
    id: itemId,
  };
}

const TIMELINE_META_EVENT_TYPES = new Set([
  'user_message_received',
  'agent_gateway_received',
  'provider_selected',
  'context_usage_updated',
  'tool_budget_applied',
  'llm_thinking_started',
  'llm_thinking_completed',
]);

function formatMetaDetail(event) {
  switch (event.type) {
    case 'user_message_received':
      return 'Task accepted into the session.';
    case 'agent_gateway_received':
      return 'Execution route selected.';
    case 'provider_selected': {
      const provider = event.provider || event.providerKey || 'auto';
      const model = event.model ? ` · ${event.model}` : '';
      return `Model · ${provider}${model}`;
    }
    case 'context_usage_updated': {
      const used = formatTraceTokens(event.usedTokens);
      const total = formatTraceTokens(event.totalTokens);
      if (!used && !total) return '';
      return `Context · ${used || '0'} / ${total || '128k'} tokens${event.compressed ? ' · compressed' : ''}`;
    }
    case 'tool_budget_applied': {
      const selected = Number(event.selectedToolCount || 0);
      const tokens = formatTraceTokens(event.estimatedTokens);
      return `Tool budget · ${selected || 0} tools${tokens ? ` · ${tokens} tokens` : ''}`;
    }
    case 'llm_thinking_started':
      return event.message || 'Reasoning has started.';
    case 'llm_thinking_completed':
      return event.message || 'Reasoning step complete.';
    default:
      return '';
  }
}

function categorizeToolCall(call) {
  if (isSubAgentTraceItem(call)) return 'subagent';
  if (isSkillTraceItem(call)) return 'skill';
  if (isMcpTraceItem(call)) return 'mcp';
  return 'tool';
}

function timelineToolLabel(call, category) {
  if (category === 'skill') {
    return skillDisplayName({
      skill_name: call.skillName,
      skill_path: call.skillPath,
      tool_name: call.toolName,
      input_summary: call.inputSummary,
      output_summary: call.outputSummary,
      message: call.message,
    });
  }
  return chatTraceToolName(call.toolName);
}

function buildChatTimeline(task, taskStatus) {
  const events = Array.isArray(task?.eventLog) ? task.eventLog : [];
  const toolCalls = Array.isArray(task?.toolCalls) ? task.toolCalls : [];
  const toolByCallId = new Map();
  for (const call of toolCalls) {
    if (call?.callId) toolByCallId.set(call.callId, call);
  }
  const finalStatus = normalizeTaskStatus(taskStatus || task?.status);
  const isRunning = finalStatus === 'running' || finalStatus === 'queued';

  const items = [];
  let textBuf = '';
  let textSegmentIndex = 0;
  let thinkingBuf = '';
  let thinkingSegmentIndex = 0;
  let currentSkillItem = null;
  const seenToolIds = new Set();

  const flushThinking = (streaming = false) => {
    const value = thinkingBuf;
    thinkingBuf = '';
    if (!value.trim()) return;
    items.push({
      kind: 'thinking',
      id: `thinking-${thinkingSegmentIndex}`,
      text: value,
      status: streaming ? 'running' : 'done',
      streaming,
    });
    thinkingSegmentIndex += 1;
    currentSkillItem = null;
  };

  const flushText = () => {
    const value = textBuf;
    textBuf = '';
    if (!value.trim()) return;
    items.push({
      kind: 'text',
      id: `text-${textSegmentIndex}`,
      text: value,
      streaming: false,
    });
    textSegmentIndex += 1;
    currentSkillItem = null;
  };

  for (const event of events) {
    const type = event.type;
    if (type === 'llm_thinking_delta') {
      if (textBuf.trim()) flushText();
      thinkingBuf += eventDeltaText(event);
      continue;
    }
    if (type === 'llm_answer_delta') {
      flushThinking(false);
      textBuf += event.message || '';
      continue;
    }
    if (type === 'llm_tool_call_requested') {
      flushThinking(false);
      if (textBuf.trim()) flushText();
      const callId = event.callId || '';
      if (callId && seenToolIds.has(callId)) continue;
      const call = (callId && toolByCallId.get(callId)) || {
        callId,
        toolName: event.toolName,
        toolGroup: event.toolGroup,
        kind: event.kind,
        skillName: event.skillName,
        skillPath: event.skillPath,
        executorRole: event.executorRole,
        executorActorId: event.executorActorId,
        inputSummary: event.inputSummary,
        outputSummary: '',
        state: 'requested',
        message: event.message,
      };
      const category = categorizeToolCall(call);
      const label = timelineToolLabel(call, category);
      const toolItem = {
        kind: 'tool',
        id: callId || `tool-${seenToolIds.size}`,
        category,
        label,
        toolName: call.toolName || '',
        inputSummary: call.inputSummary || '',
        outputSummary: call.outputSummary || '',
        executor: call.executorRole || call.executorActorId || call.toolGroup || '',
        status: getToolTraceStatus(call.state, finalStatus),
        children: [],
      };
      if (callId) seenToolIds.add(callId);
      if (category === 'skill') {
        items.push(toolItem);
        currentSkillItem = toolItem;
      } else if (currentSkillItem) {
        currentSkillItem.children.push(toolItem);
      } else {
        items.push(toolItem);
      }
      continue;
    }
    // 元事件（user_message_received / agent_gateway_received / provider_selected /
    // context_usage_updated / tool_budget_applied / llm_thinking_started/completed）
    // 不在聊天时间线里渲染——只保留 LLM 文本、reasoning 流和工具调用。
  }

  // Tail flush: streaming text still in buffer becomes a live segment.
  if (thinkingBuf.trim()) {
    flushThinking(isRunning);
  }
  if (textBuf.trim()) {
    items.push({
      kind: 'text',
      id: `text-${textSegmentIndex}`,
      text: textBuf,
      streaming: isRunning,
    });
    textSegmentIndex += 1;
  }

  // Backfill tool calls that exist in toolCalls but have no matching event yet
  // (e.g. event still in-flight). Append them in their natural order.
  for (const call of toolCalls) {
    if (!call?.callId || seenToolIds.has(call.callId)) continue;
    const category = categorizeToolCall(call);
    const label = timelineToolLabel(call, category);
    const toolItem = {
      kind: 'tool',
      id: call.callId,
      category,
      label,
      toolName: call.toolName || '',
      inputSummary: call.inputSummary || '',
      outputSummary: call.outputSummary || '',
      executor: call.executorRole || call.executorActorId || call.toolGroup || '',
      status: getToolTraceStatus(call.state, finalStatus),
      children: [],
    };
    seenToolIds.add(call.callId);
    if (category === 'skill') {
      items.push(toolItem);
      currentSkillItem = toolItem;
    } else if (currentSkillItem) {
      currentSkillItem.children.push(toolItem);
    } else {
      items.push(toolItem);
    }
  }

  // When the task is done, the final answer is rendered separately as markdown
  // below the (collapsed) timeline. If the last streamed text segment is the same
  // text (which happens when the LLM produced the answer without a tool call, so
  // TextDelta and FinalAnswer carry identical content), drop it from the timeline
  // to avoid showing the answer twice when the user expands the trace.
  if (!isRunning) {
    const finalAnswer = String(task?.answerText || '').trim();
    if (finalAnswer) {
      while (items.length) {
        const last = items[items.length - 1];
        if (last.kind !== 'text') break;
        const lastText = String(last.text || '').trim();
        if (!lastText) {
          items.pop();
          continue;
        }
        if (
          lastText === finalAnswer
          || finalAnswer.startsWith(lastText)
          || lastText.startsWith(finalAnswer)
        ) {
          items.pop();
          continue;
        }
        break;
      }
    }
  }

  // No "Preparing…" / "Queued…" placeholder——空时间线就让外面的 streaming 活动指示器
  // 单独承担"任务进行中"的视觉反馈，避免连续显示两条无内容信息。

  return { items };
}

function pendingTaskToQuest(pendingTask) {
  return {
    id: 'pending',
    title: pendingTask.title,
    description: pendingTask.description,
    status: pendingTask.status,
    stepIdx: 0,
    totalSteps: 0,
    createdAt: pendingTask.createdAt,
    completedAt: pendingTask.completedAt || null,
    stage: pendingTask.stage,
    assignedTo: pendingTask.assignedTo,
    assignedToLabel: pendingTask.assignedToLabel,
    requestedProvider: pendingTask.requestedProvider,
    answerText: pendingTask.answerText || '',
    error: pendingTask.error || null,
    serverFinished: !!pendingTask.serverFinished,
  };
}

function clonePointMap(source) {
  return Object.fromEntries(
    Object.entries(source).map(([id, point]) => [id, { ...point }])
  );
}

function clamp01(value) {
  return Math.max(0.02, Math.min(0.98, value));
}

function roundCoord(value) {
  return Math.round(value * 1000) / 1000;
}

function serializePointMap(name, ids, pointMap, includeLabel = false) {
  const rows = ids.map((id) => {
    const point = pointMap[id];
    if (includeLabel) {
      const label = window.STATIONS[id]?.label || point?.label || '';
      return `  ${id}: { x: ${point.x.toFixed(3)}, y: ${point.y.toFixed(3)}, label: '${label}' },`;
    }
    return `  ${id}: { x: ${point.x.toFixed(3)}, y: ${point.y.toFixed(3)} },`;
  }).join('\n');
  return `const ${name} = {\n${rows}\n};`;
}

function serializePoseConfigMap(ids, getConfig) {
  const poseKeys = POSE_DEBUG_OPTIONS.filter((option) => option.key !== 'idle').map((option) => option.key);
  const rows = ids.map((id) => {
    const config = getConfig(id);
    const poseRows = poseKeys.map((key) => `      ${key}: ${config.poses[key]},`).join('\n');
    return [
      `  ${id}: {`,
      `    idle: { front: ${config.idle.front}, side: ${config.idle.side}, back: ${config.idle.back} },`,
      `    walk: {`,
      `      front: [${config.walk.front.join(', ')}],`,
      `      side: [${config.walk.side.join(', ')}],`,
      `      back: [${config.walk.back.join(', ')}],`,
      `    },`,
      `    poses: {`,
      poseRows,
      `    },`,
      `  },`,
    ].join('\n');
  }).join('\n');
  return `const POSE_CONFIG_OVERRIDES = {\n${rows}\n};`;
}

function App() {
  const [worldTaskState, setWorldTaskState] = useState(() => createEmptyWorldTaskState());
  const [workspaceState, setWorkspaceState] = useState(() => loadStoredWorkspaceState());
  const [activeTab, setActiveTab] = useState('dashboard');
  const [viewMode, setViewMode] = useState('world');
  const viewModeRef = useRef('world');
  const [npcStates, setNpcStates] = useState(() => {
    const s = {};
    for (const id of Object.keys(window.STATIONS)) {
      s[id] = { pos: window.STATIONS[id], dir: 'front', walking: false };
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
  const [uploadState, setUploadState] = useState({ active: false, fileName: '' });
  const [toast, setToast] = useState(null);
  const [activeProvider, setActiveProvider] = useState('openai');
  const [providerLoading, setProviderLoading] = useState(true);

  const stageRef = useRef(null);
  const abortRef = useRef(false);
  const npcStatesRef = useRef(npcStates);
  const originalStationsRef = useRef(clonePointMap(window.STATIONS));
  const originalNavRef = useRef(clonePointMap(window.NAV_POINTS));
  const originalMeetRef = useRef(clonePointMap(window.MEET_POINTS));
  const dragStateRef = useRef(null);
  const copyTimerRef = useRef(null);
  const [calibrationMode, setCalibrationMode] = useState(false);
  const [calibrationTarget, setCalibrationTarget] = useState('stations');
  const [selectedMarkerId, setSelectedMarkerId] = useState(window.CALIBRATION_IDS[0]);
  const [selectedRouteId, setSelectedRouteId] = useState(window.ROUTE_EDITOR_IDS[0] || window.ROUTE_IDS[0] || null);
  const [selectedPoseNpcId, setSelectedPoseNpcId] = useState(window.CALIBRATION_IDS[0]);
  const [selectedPoseMappingKey, setSelectedPoseMappingKey] = useState(POSE_MAPPING_FIELDS[0].key);
  const [selectedPoseSourceKey, setSelectedPoseSourceKey] = useState(null);
  const [stationDrafts, setStationDrafts] = useState(() => clonePointMap(window.STATIONS));
  const [navDrafts, setNavDrafts] = useState(() => clonePointMap(window.NAV_POINTS));
  const [meetDrafts, setMeetDrafts] = useState(() => clonePointMap(window.MEET_POINTS));
  const [copiedCoords, setCopiedCoords] = useState(false);
  const activeTaskIdRef = useRef(null);
  const fetchAbortRef = useRef(null);
  const answerBufferRef = useRef('');
  const chatFinalizedTaskIdsRef = useRef(new Set());
  const pendingPresentationTaskIdsRef = useRef(new Set());
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
  const userIdRef = useRef(getOrCreateUserId());
  const toastTimerRef = useRef(null);
  const conversationActivationSeqRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/llm/provider`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data || !data.provider) return;
        setActiveProvider(String(data.provider));
      })
      .catch((error) => console.warn('failed to fetch active provider', error))
      .finally(() => {
        if (!cancelled) setProviderLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

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

  const modelCatalog = useMemo(
    () => (window.resolveModelCatalog ? window.resolveModelCatalog(activeProvider) : null),
    [activeProvider],
  );
  const modelOptions = modelCatalog?.options;
  const defaultModelId = modelCatalog?.defaultModelId;

  useEffect(() => { npcStatesRef.current = npcStates; }, [npcStates]);
  useEffect(() => { worldTaskStateRef.current = worldTaskState; }, [worldTaskState]);
  useEffect(() => { viewModeRef.current = viewMode; }, [viewMode]);
  useEffect(() => { saveWorkspaceState(workspaceState); }, [workspaceState]);

  function invalidateConversationActivation() {
    conversationActivationSeqRef.current += 1;
    return conversationActivationSeqRef.current;
  }

  function isConversationActivationCurrent(seq) {
    return conversationActivationSeqRef.current === seq;
  }

  async function restoreLatestTaskRuntime(taskId, isCurrentActivation = () => true) {
    if (!taskId) {
      if (isCurrentActivation()) setAgentLive({});
      return;
    }
    const response = await fetch(`${API_BASE}/api/tasks/${taskId}`, {
      method: 'GET',
      headers: {
        'X-Agent-User-Id': userIdRef.current,
      },
    });
    if (!response.ok) {
      throw new Error(`task restore failed: ${response.status}`);
    }
    const task = await response.json();
    if (!isCurrentActivation()) return;
    const events = normalizeWorldEvents(task.events);
    const normalizedTask = { ...task, events };
    updateWorldTaskState((state) => ({
      ...state,
      tasksById: {
        ...state.tasksById,
        [taskId]: taskDetailToRuntimeTask(normalizedTask, state.tasksById[taskId] || null),
      },
    }));
    setAgentLive(buildAgentLiveSnapshot(normalizedTask, events));
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
            { title: DEFAULT_SESSION_NAME },
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

  function updateWorldTaskState(updater) {
    setWorldTaskState((state) => {
      const next = updater(state);
      worldTaskStateRef.current = next;
      return next;
    });
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
    setLocalWorkspace({
      path: detail.workspace_path || null,
      label: detail.workspace_label || null,
    });
  }

  async function activateConversationDetail(detail, { restoreLatest = true } = {}) {
    if (!detail?.conversation_id) return;
    const activationSeq = invalidateConversationActivation();
    const isCurrentActivation = () => isConversationActivationCurrent(activationSeq);
    // 切走前先把当前 conversation 的实时 worldTaskState flush 回
    // workspaceState[当前 conversation].tasks。否则切到别的会话后，旧会话
    // sidebar 节点会回退到上一次 activate 时拉到的 detail.tasks 快照，刚跑
    // 完的任务消失，要再切回去触发一次 fetch 才会重新出现。
    setWorkspaceState((state) => {
      const previousId = state.activeConversationId;
      if (!previousId || previousId === detail.conversation_id) return state;
      const snapshot = worldTaskStateRef.current;
      const currentTasks = snapshot.taskOrder
        .map((taskId) => snapshot.tasksById[taskId])
        .filter(Boolean);
      if (currentTasks.length === 0) return state;
      return {
        ...state,
        projects: state.projects.map((project) => ({
          ...project,
          conversations: project.conversations.map((conversation) =>
            conversation.id === previousId
              ? { ...conversation, tasks: currentTasks }
              : conversation,
          ),
        })),
      };
    });
    if (!isCurrentActivation()) return;
    const restoredConversationId = detail.conversation_id;
    const restoredTasks = Array.isArray(detail.tasks) ? detail.tasks : [];
    const latestTaskId = detail.last_task_id || (restoredTasks.length ? restoredTasks[restoredTasks.length - 1].task_id : null);
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
    setWorldTaskState({
      activeTaskId: null,
      pendingTask: null,
      taskOrder: sortTaskIdsForRestore(restoredTasks, latestTaskId),
      tasksById: Object.fromEntries(
        restoredTasks.map((task) => [task.task_id, taskSummaryToRuntimeTask(task)])
      ),
    });
    if (restoreLatest && latestTaskId) {
      try {
        await restoreLatestTaskRuntime(latestTaskId, isCurrentActivation);
      } catch (error) {
        if (!isCurrentActivation()) return;
        console.error('latest task restore failed', error);
        setAgentLive({});
      }
    } else {
      if (isCurrentActivation()) setAgentLive({});
    }
  }

  async function fetchConversationDetail(nextConversationId) {
    const detailResponse = await fetch(`${API_BASE}/api/conversations/${nextConversationId}`, {
      method: 'GET',
      headers: {
        'X-Agent-User-Id': userIdRef.current,
      },
    });
    if (!detailResponse.ok) {
      throw new Error(`conversation restore failed: ${detailResponse.status}`);
    }
    return detailResponse.json();
  }

  function ensureTaskForEvent(event) {
    const taskId = event.task_id || activeTaskIdRef.current || worldTaskStateRef.current.activeTaskId;
    if (!taskId) return null;

    updateWorldTaskState((state) => {
      const existingTask = state.tasksById[taskId];
      const pendingTask = state.pendingTask;
      const baseTask = existingTask || buildWorldTaskRecord(event, pendingTask);
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
          },
        },
      };
    });

    activeTaskIdRef.current = taskId;
    return taskId;
  }

  function updateTaskById(taskId, updater) {
    if (!taskId) return;
    updateWorldTaskState((state) => {
      const task = state.tasksById[taskId];
      if (!task) return state;
      const nextTask = typeof updater === 'function' ? updater(task) : { ...task, ...updater };
      return {
        ...state,
        tasksById: {
          ...state.tasksById,
          [taskId]: nextTask,
        },
      };
    });
  }

  function getTaskById(taskId) {
    return taskId ? worldTaskStateRef.current.tasksById[taskId] || null : null;
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

  function buildSceneItem(event, taskId) {
    if (!event || !taskId) return null;
    const runtime = sceneRuntimeRef.current;
    runtime.seq += 1;
    const task = getTaskById(taskId);
    const context = resolveScenePlaybackContext(event, task);
    return {
      queueId: `scene-${runtime.seq}`,
      taskId,
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

  function compactPendingSceneItems(taskId) {
    const runtime = sceneRuntimeRef.current;
    if (!taskId || !runtime.pending.length) return;
    const targetItems = runtime.pending.filter((item) => item.taskId === taskId);
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
      if (item.taskId !== taskId) return [item];
      if (inserted) return [];
      inserted = true;
      return compacted;
    });

    updateTaskById(taskId, (task) => ({
      ...task,
      sceneCatchup: true,
    }));
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
    if (!actor || !window.STATIONS[actor]) return;
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
    if (!actor || !window.STATIONS[actor]) return;
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
    if (!actor || !window.STATIONS[actor]) return;
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
    if (!actor || !window.STATIONS[actor]) return;
    const path = [...resolvePathSpec(pathSpec), window.STATIONS[actor]];
    await animateWalk(actor, path, meta);
    setActorIdle(actor);
  }

  function resetSceneActors() {
    for (const actor of Object.keys(window.STATIONS)) {
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

  function finalizeTaskPresentation(taskId, resultText) {
    if (!taskId) return;
    pendingPresentationTaskIdsRef.current.delete(taskId);
    updateTaskById(taskId, (task) => ({
      ...task,
      status: ['failed', 'cancelled', 'aborted'].includes(task.status) ? normalizeTaskStatus(task.status) : 'done',
      stage: 'done',
      completedAt: task.completedAt || Date.now(),
      answerText: resultText || task.answerText,
      presentationPending: false,
      serverFinished: true,
      sceneCatchup: false,
    }));
    updateWorldTaskState((state) => ({ ...state, activeTaskId: null }));
    setBusy(false);
    activeTaskIdRef.current = null;
    fetchAbortRef.current = null;
    dropPendingSceneItems(taskId);
    resetSceneActors();
    completeTaskAgents(taskId, 'done');
  }

  function isChatOriginTask(taskId) {
    const task = getTaskById(taskId);
    return task?.originViewMode === 'chat' || viewModeRef.current === 'chat';
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
        await playWorldEventScene(item.event, item.taskId);
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

  function enqueueSceneEvent(event, taskId) {
    const item = buildSceneItem(event, taskId);
    if (!item) return Promise.resolve();
    sceneRuntimeRef.current.pending.push(item);
    return pumpSceneQueue();
  }

  function scheduleSceneEvent(event, taskId) {
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
    return enqueueSceneEvent(event, taskId);
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
      return window.STATIONS[ref] || window.NAV_POINTS?.[ref] || window.MEET_POINTS?.[ref] || null;
    }
    return ref;
  }

  function resolvePathSpec(spec) {
    if (!spec) return [];
    if (Array.isArray(spec)) return spec.flatMap((item) => resolvePathSpec(item));
    if (typeof spec === 'string' && window.ROUTES?.[spec]) {
      return window.ROUTES[spec].flatMap((item) => resolvePathSpec(item));
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
      for (const id of Object.keys(window.STATIONS)) {
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
    const def = window.CHAR_DEFS[id];
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
    const def = window.CHAR_DEFS[id];
    const config = getCharPoseConfig(id);
    const field = POSE_MAPPING_FIELDS.find((item) => item.key === mappingKey);
    if (!def || !config || !field) return null;
    if (field.type === 'idle') return config.idle[field.dir];
    if (field.type === 'walk') return config.walk[field.dir]?.[0] ?? def.idle[field.dir] ?? def.idle.front;
    return config.poses[field.key];
  }

  function applyPoseMapping(id, mappingKey, frame) {
    const def = window.CHAR_DEFS[id];
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
    const def = window.CHAR_DEFS[id];
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
    const def = window.CHAR_DEFS[id];
    if (!def) return;
    def.poseConfig = {
      idle: { ...def.idle },
      walk: Object.fromEntries(Object.entries(def.walk).map(([dir, frames]) => [dir, [...frames]])),
      poses: { ...def.poses },
    };
    updateNpc(id, (npc) => ({ ...npc, poseDebug: null }));
  }

  function getIdsForTarget(target) {
    if (target === 'routes') return [...new Set((window.ROUTE_EDITOR_DEFS?.[selectedRouteId]?.refs || window.ROUTES[selectedRouteId] || []))];
    if (target === 'meet') return window.MEET_POINT_IDS;
    return window.CALIBRATION_IDS;
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
    if (target === 'nav') return window.NAV_POINTS;
    if (target === 'meet') return window.MEET_POINTS;
    return window.STATIONS;
  }

  function resolvePointTarget(id) {
    if (window.NAV_POINTS[id]) return 'nav';
    if (window.MEET_POINTS[id]) return 'meet';
    if (window.STATIONS[id]) return 'stations';
    return null;
  }

  function getFirstRouteRef(routeId) {
    const route = window.ROUTE_EDITOR_DEFS?.[routeId]?.refs || window.ROUTES[routeId] || [];
    return route[0] || null;
  }

  function getPointDisplayName(target, id) {
    if (target === 'stations') return window.CHAR_DEFS[id]?.name || id;
    if (target === 'routes') {
      const sourceTarget = resolvePointTarget(id);
      if (sourceTarget === 'meet') return `${id} · report point`;
      if (sourceTarget === 'stations') return `${window.CHAR_DEFS[id]?.name || id} · station`;
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
      if (!drag || !calibrationMode || busy) return;
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
  }, [busy, calibrationMode]);

  function handleMarkerPointerDown(target, id, event) {
    if (!calibrationMode || busy) return;
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

  function handleToggleCalibration() {
    if (busy) return;
    if (activeTab !== 'dashboard') setActiveTab('dashboard');
    dragStateRef.current = null;
    const stationSnapshot = clonePointMap(window.STATIONS);
    setStationDrafts(stationSnapshot);
    setNavDrafts(clonePointMap(window.NAV_POINTS));
    setMeetDrafts(clonePointMap(window.MEET_POINTS));
    syncNpcPositions(stationSnapshot);
    clearAllPoseDebug();
    setCalibrationMode((enabled) => !enabled);
    setCopiedCoords(false);
  }

  function handleResetCalibration() {
    if (busy) return;
    if (calibrationTarget === 'poses') {
      for (const id of window.CALIBRATION_IDS) resetPoseMapping(id);
      clearAllPoseDebug();
      setCopiedCoords(false);
      return;
    }
    const ids = getIdsForTarget(calibrationTarget);
    const restored = calibrationTarget === 'routes' ? null : calibrationTarget === 'nav' ? clonePointMap(originalNavRef.current) : calibrationTarget === 'meet' ? clonePointMap(originalMeetRef.current) : clonePointMap(originalStationsRef.current);
    if (calibrationTarget === 'routes') {
      for (const id of ids) {
        const rt = resolvePointTarget(id);
        if (rt === 'meet') window.MEET_POINTS[id] = { ...originalMeetRef.current[id] };
        else if (rt === 'stations') window.STATIONS[id] = { ...originalStationsRef.current[id] };
        else window.NAV_POINTS[id] = { ...originalNavRef.current[id] };
      }
      setNavDrafts(clonePointMap(window.NAV_POINTS)); setMeetDrafts(clonePointMap(window.MEET_POINTS)); setStationDrafts(clonePointMap(window.STATIONS));
      syncNpcPositions(window.STATIONS);
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
    if (step.fx || step.kind === 'llm') pushBurst(npcStatesRef.current[actor].pos, window.KIND_COLORS[step.kind]);
    await sleep(step.duration || 1200);
    updateNpc(actor, { action: null, bubble: null, busy: false, thinking: false });
    if (step.faceToFaceWith) updateNpc(step.faceToFaceWith, { dir: 'front' });
    if (travelPoints.length && step.returnHome !== false) {
      const rp = [ ...(step.returnRoute ? resolvePathSpec(step.returnRoute) : travelPoints.slice(0, -1).reverse()), window.STATIONS[actor] ];
      const returnMeta = actor === 'itachi' && step.kind === 'report' ? { preferSideWalk: true } : {};
      await sleep(120); await animateWalk(actor, rp, returnMeta); updateNpc(actor, { dir: 'front', walking: false });
    }
  }

  async function playWorldEventScene(event, taskId) {
    if (!taskId) return;
    const run = getTaskById(taskId);
    const providerMeta = resolveProviderMeta(event, run);
    const actorId = event.actor_id || WORLD_ROLE_TO_ACTOR[event.actor];
    const targetActorId = event.target_actor_id || WORLD_ROLE_TO_ACTOR[event.target];
    const executorActorId = event.executor_actor_id || executorActorForToolGroup(event.tool_group);
    const sceneKey = sceneKeyForWorldEvent(event, executorActorId);
    const routeConfig = WORLD_EVENT_ROUTE_MAP[sceneKey] || WORLD_EVENT_ROUTE_MAP[event.type];
    const actor = PROVIDER_SCENE_EVENT_TYPES.has(event.type)
      ? providerMeta.actor
      : routeConfig?.actor || actorId;
    if (!actor || !window.STATIONS[actor]) return;

    const bubble = event.type === 'provider_selected'
      ? providerMeta.label
      : event.message || event.delta || routeConfig?.bubble || '';
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
      pushBurst(npcStatesRef.current[actor]?.pos || window.STATIONS[actor], window.KIND_COLORS?.[kind] || '#efbf64');
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
        pushBurst(npcStatesRef.current.gojo?.pos || window.STATIONS.gojo, window.KIND_COLORS?.llm || '#efbf64');
        await sleep(760);
        setActorIdle('gojo');
        setHollow({
          title: getTaskById(taskId)?.title || event.message || 'Final Report',
          result: event.content || getTaskById(taskId)?.answerText || answerBufferRef.current,
          taskId,
        });
        finalizeTaskPresentation(taskId, event.content || getTaskById(taskId)?.answerText || answerBufferRef.current);
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

  async function uploadAttachment(file, signal) {
    if (!file || !conversationId) return null;
    const formData = new FormData();
    formData.append('conversation_id', conversationId);
    formData.append('file', file);
    const response = await fetch(`${API_BASE}/api/documents/upload`, {
      method: 'POST',
      headers: {
        'X-Agent-User-Id': userIdRef.current,
      },
      body: formData,
      signal,
    });
    if (!response.ok) {
      throw new Error(`upload failed: ${response.status}`);
    }
    return response.json();
  }

  async function pickLocalWorkspace() {
    if (!conversationId) return;
    const response = await fetch(`${API_BASE}/api/conversations/${conversationId}/workspace/pick`, {
      method: 'POST',
      headers: {
        'X-Agent-User-Id': userIdRef.current,
      },
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

  async function handleAttachmentSelect(file) {
    if (!file || !conversationId) return;
    const uploadController = new AbortController();
    fetchAbortRef.current = uploadController;
    setComposerAttachment({
      name: file.name,
      size: file.size,
      type: file.type,
      uploaded: false,
    });
    setUploadState({ active: true, fileName: file.name });
    try {
      const payload = await uploadAttachment(file, uploadController.signal);
      const nextAttachment = {
        name: payload?.attachment?.file_name || file.name,
        size: payload?.attachment?.size_bytes ?? file.size,
        type: payload?.attachment?.content_type || file.type,
        uploaded: true,
        documentId: payload?.attachment?.document_id || payload?.document?.id || null,
        attachmentId: payload?.attachment?.attachment_id || null,
        title: payload?.attachment?.title || file.name,
        conversationId: payload?.attachment?.conversation_id || conversationId,
      };
      applyConversationSnapshot(payload?.conversation || null);
      setComposerAttachment(nextAttachment);
      showToast('success', `document uploaded: ${String(file.name || '').toLowerCase()}`);
    } catch (error) {
      setComposerAttachment(null);
      if (!(abortRef.current || error?.name === 'AbortError')) {
        showToast('error', `upload failed: ${String(file.name || '').toLowerCase()}`);
      }
      throw error;
    } finally {
      if (fetchAbortRef.current === uploadController) {
        fetchAbortRef.current = null;
      }
      setUploadState({ active: false, fileName: '' });
    }
  }

  function handleAttachmentClear() {
    setComposerAttachment(null);
  }

  async function cancelActiveTask(taskId) {
    return fetch(`${API_BASE}/api/tasks/${taskId}/cancel`, {
      method: 'POST',
      headers: {
        'X-Agent-User-Id': userIdRef.current,
      },
    });
  }

  async function readNdjsonStream(response, onEvent) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line) {
          const event = normalizeWorldEvent(JSON.parse(line));
          if (event) onEvent(event);
        }
        newlineIndex = buffer.indexOf('\n');
      }
    }
    const tail = buffer.trim();
    if (tail) {
      const event = normalizeWorldEvent(JSON.parse(tail));
      if (event) onEvent(event);
    }
  }

  function applyWorldEvent(event) {
    const taskId = ensureTaskForEvent(event);
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
    if (isChatOriginTask(taskId)) {
      const progressLine = getChatProgressLine(event);
      if (progressLine) {
        updateTaskById(taskId, (run) => ({
          ...run,
          chatStreamText: appendChatProgressText(run.chatStreamText, progressLine),
        }));
      }
    }

    switch (event.type) {
      case 'context_usage_updated': {
        const nextContextUsage = normalizeContextUsage({
          conversationId: event.conversation_id || conversationId,
          usedTokens: event.used_tokens,
          totalTokens: event.total_tokens,
          compressed: event.compressed,
          compressedCount: event.compressed_count,
          updatedAt: event.created_at || event.timestamp || new Date().toISOString(),
        }, conversationId);
        setContextUsage(nextContextUsage);
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
          const nextState = event.type === 'tool_manager_received'
            ? 'received'
            : event.type === 'tool_dispatched'
              ? 'dispatched'
              : event.type === 'tool_executor_started'
                ? 'running'
                : event.type === 'tool_executor_completed'
                  ? 'completed'
                  : 'returned';
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
              message: event.message || existingToolCall?.message || '',
            }),
          };
        });
        break;
      case 'llm_answer_delta': {
        if (chatFinalizedTaskIdsRef.current.has(taskId) || getTaskById(taskId)?.serverFinished) {
          break;
        }
        answerBufferRef.current = appendAnswerDelta(
          answerBufferRef.current,
          event.delta || event.text || event.content_delta || ''
        );
        updateTaskById(taskId, (run) => ({
          ...run,
          answerText: answerBufferRef.current,
          chatStreamText: run.chatStreamText,
          loopIndex,
        }));
        break;
      }
      case 'llm_final_answer': {
        answerBufferRef.current = event.content || answerBufferRef.current;
        if (isChatOriginTask(taskId)) {
          chatFinalizedTaskIdsRef.current.add(taskId);
          updateTaskById(taskId, (run) => ({
            ...run,
            status: 'done',
            stage: 'done',
            completedAt: run.completedAt || Date.now(),
            loopIndex,
            answerText: answerBufferRef.current,
            presentationPending: false,
            serverFinished: true,
            sceneCatchup: false,
            providerState: run.providerState ? { ...run.providerState, state: 'completed' } : run.providerState,
          }));
          updateWorldTaskState((state) => ({ ...state, activeTaskId: null }));
          setBusy(false);
          activeTaskIdRef.current = null;
          completeTaskAgents(taskId, 'done');
          break;
        }
        updateTaskById(taskId, (run) => ({
          ...run,
          stage: 'check',
          loopIndex,
          answerText: answerBufferRef.current,
          providerState: run.providerState ? { ...run.providerState, state: 'completed' } : run.providerState,
        }));
        break;
      }
      case 'agent_gateway_reported':
        if (isChatOriginTask(taskId)) {
          chatFinalizedTaskIdsRef.current.add(taskId);
          pendingPresentationTaskIdsRef.current.delete(taskId);
          updateTaskById(taskId, (run) => ({
            ...run,
            status: 'done',
            stage: 'done',
            completedAt: run.completedAt || Date.now(),
            answerText: run.answerText || event.content || answerBufferRef.current,
            presentationPending: false,
            serverFinished: true,
            sceneCatchup: false,
          }));
          updateWorldTaskState((state) => ({ ...state, activeTaskId: null }));
          setBusy(false);
          activeTaskIdRef.current = null;
          fetchAbortRef.current = null;
          dropPendingSceneItems(taskId);
          completeTaskAgents(taskId, 'done');
          break;
        }
        pendingPresentationTaskIdsRef.current.add(taskId);
        updateTaskById(taskId, (run) => ({
          ...run,
          stage: 'check',
          loopIndex,
          answerText: event.content || answerBufferRef.current,
          presentationPending: true,
        }));
        break;
      case 'run_cancelled':
        pendingPresentationTaskIdsRef.current.delete(taskId);
        chatFinalizedTaskIdsRef.current.add(taskId);
        updateTaskById(taskId, (run) => applyTerminalTaskState(run, 'cancelled', { aborted: true }));
        updateWorldTaskState((state) => ({ ...state, activeTaskId: null }));
        setBusy(false);
        activeTaskIdRef.current = null;
        fetchAbortRef.current = null;
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
        setBusy(false);
        activeTaskIdRef.current = null;
        fetchAbortRef.current = null;
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
            status: terminalStatus,
            stage: terminalStatus === 'done'
              ? (hasPresentationPending ? (persistedTask?.stage || run.stage) : (persistedTask?.stage || 'done'))
              : 'done',
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
            answerText: chatFinalizedTaskIdsRef.current.has(taskId) && run.answerText
              ? run.answerText
              : (persistedTask?.answer_text || (terminalStatus === 'done' ? (toDisplayText(event.message) || run.answerText) : run.answerText)),
            error: terminalError,
            serverFinished: true,
            sceneCatchup: hasPresentationPending,
          };
        });
        if (shouldWaitForPresentation && !isChatOriginTask(taskId)) {
          compactPendingSceneItems(taskId);
          break;
        }
        updateWorldTaskState((state) => ({ ...state, activeTaskId: null }));
        setBusy(false);
        activeTaskIdRef.current = null;
        fetchAbortRef.current = null;
        dropPendingSceneItems(taskId);
        resetSceneActors();
        completeTaskAgents(taskId, getTaskById(taskId)?.status || event.status || 'done');
        break;
      default:
        break;
    }

    if (WORLD_SCENE_EVENT_TYPES.has(event.type) && !isChatOriginTask(taskId)) {
      scheduleSceneEvent(event, taskId);
    }
  }

  async function executeQuest(pendingTask) {
    if (!conversationId) {
      throw new Error('conversation is not ready');
    }
    abortRef.current = false;
    answerBufferRef.current = '';
    setBusy(true);
    updateWorldTaskState((state) => ({
      ...state,
      pendingTask: {
        ...pendingTask,
        status: 'running',
        stage: 'assigned',
      },
    }));

    if (pendingTask.attachment?.file && !pendingTask.attachment?.uploaded) {
      const uploadController = new AbortController();
      const uploadName = pendingTask.attachment.name || pendingTask.attachment.file.name || 'document';
      fetchAbortRef.current = uploadController;
      setUploadState({ active: true, fileName: uploadName });
      try {
        const payload = await uploadAttachment(pendingTask.attachment.file, uploadController.signal);
        const nextAttachment = {
          name: payload?.attachment?.file_name || uploadName,
          size: payload?.attachment?.size_bytes ?? pendingTask.attachment.size,
          type: payload?.attachment?.content_type || pendingTask.attachment.type,
          uploaded: true,
          documentId: payload?.attachment?.document_id || payload?.document?.id || null,
          attachmentId: payload?.attachment?.attachment_id || null,
          title: payload?.attachment?.title || pendingTask.attachment.name || uploadName,
          conversationId: payload?.attachment?.conversation_id || conversationId,
        };
        pendingTask.attachment = { ...pendingTask.attachment, ...nextAttachment };
        applyConversationSnapshot(payload?.conversation || null);
        setComposerAttachment(nextAttachment);
        showToast('success', `document uploaded: ${String(uploadName || '').toLowerCase()}`);
      } catch (error) {
        if (!(abortRef.current || error?.name === 'AbortError')) {
          showToast('error', `upload failed: ${String(uploadName || '').toLowerCase()}`);
        }
        throw error;
      } finally {
        if (fetchAbortRef.current === uploadController) {
          fetchAbortRef.current = null;
        }
        setUploadState({ active: false, fileName: '' });
      }
    }

    const controller = new AbortController();
    fetchAbortRef.current = controller;
    const response = await fetch(`${API_BASE}/api/conversations/${conversationId}/tasks/stream`, {
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
        options: {
          provider: pendingTask.requestedProvider || 'auto',
          model_id: pendingTask.requestedModelId || null,
          reasoning_effort: pendingTask.requestedReasoningEffort || 'high',
          use_history: true,
        },
      }),
      signal: controller.signal,
    });
    if (!response.ok || !response.body) {
      throw new Error(`world stream failed: ${response.status}`);
    }

    await readNdjsonStream(response, (event) => {
      if (event.task_id && !chatFinalizedTaskIdsRef.current.has(event.task_id)) {
        activeTaskIdRef.current = event.task_id;
      }
      applyWorldEvent(event);
    });
  }

  async function handleStop() {
    if (!busy) return;
    abortRef.current = true;
    fetchAbortRef.current?.abort?.();
    if (activeTaskIdRef.current) {
      try {
        await cancelActiveTask(activeTaskIdRef.current);
      } catch (error) {
        console.error('cancel failed', error);
      }
      // 关键：把 taskId 加入 finalized set，让 applyWorldEvent 早退，
      // 避免后续 in-flight 的 SSE 事件把 status 从 'cancelled' 改回 'running'。
      chatFinalizedTaskIdsRef.current.add(activeTaskIdRef.current);
      updateTaskById(activeTaskIdRef.current, (task) => applyTerminalTaskState(task, 'cancelled', { aborted: true }));
      completeTaskAgents(activeTaskIdRef.current, 'cancelled');
      dropPendingSceneItems(activeTaskIdRef.current);
    } else {
      updateWorldTaskState((state) => ({
        ...state,
        pendingTask: state.pendingTask
          ? applyTerminalTaskState(state.pendingTask, 'cancelled', { aborted: true })
          : null,
      }));
      dropPendingSceneItems();
    }
    activeTaskIdRef.current = null;
    fetchAbortRef.current = null;
    updateWorldTaskState((state) => ({ ...state, activeTaskId: null }));
    resetSceneActors();
    setBusy(false);
  }

  function handleDeploy(text, attachment, modelId, reasoningEffort) {
    const pendingTask = createPendingTaskDraft(text, attachment);
    pendingTask.requestedModelId = modelId || '';
    pendingTask.requestedReasoningEffort = reasoningEffort || 'high';
    pendingTask.requestedProvider = 'auto';
    pendingTask.originViewMode = viewModeRef.current || viewMode;
    setComposerAttachment(null);
    setWorkspaceState((state) => ({
      ...state,
      projects: state.projects.map((project) => ({
        ...project,
        conversations: project.conversations.map((conversation) => {
          if (conversation.id !== conversationId) return conversation;
          if (!isDefaultConversationName(conversation.name) || (conversation.tasks || []).length > 0) {
            return conversation;
          }
          const nextTitle = titleFromTaskText(text);
          return nextTitle ? { ...conversation, name: nextTitle, title: nextTitle } : conversation;
        }),
      })),
    }));
    updateWorldTaskState((state) => ({
      ...state,
      pendingTask,
    }));
    executeQuest(pendingTask).catch((error) => {
      if (abortRef.current || error?.name === 'AbortError') {
        return;
      }
      console.error(error);
      const errorMessage = String(error?.message || error);
      if (activeTaskIdRef.current) {
        chatFinalizedTaskIdsRef.current.add(activeTaskIdRef.current);
        updateTaskById(activeTaskIdRef.current, (task) => ({
          ...applyTerminalTaskState(task, 'failed', {
            error: errorMessage,
            aborted: false,
          }),
        }));
        updateWorldTaskState((state) => ({ ...state, activeTaskId: null }));
      } else {
        updateWorldTaskState((state) => ({
          ...state,
          pendingTask: state.pendingTask
            ? applyTerminalTaskState(state.pendingTask, 'failed', {
                error: errorMessage,
                aborted: false,
              })
            : null,
        }));
      }
      setBusy(false);
      if (activeTaskIdRef.current) {
        dropPendingSceneItems(activeTaskIdRef.current);
      } else {
        dropPendingSceneItems();
      }
      resetSceneActors();
      if (activeTaskIdRef.current) {
        completeTaskAgents(activeTaskIdRef.current, 'failed');
      }
      activeTaskIdRef.current = null;
      fetchAbortRef.current = null;
    });
  }

  async function handleSelectConversation(projectId, nextConversationId) {
    const requestSeq = invalidateConversationActivation();
    if (!nextConversationId || nextConversationId === conversationId) {
      setWorkspaceState((state) => ({
        ...state,
        activeProjectId: projectId,
        activeConversationId: nextConversationId,
      }));
      return;
    }
    const detail = await fetchConversationDetail(nextConversationId);
    if (!isConversationActivationCurrent(requestSeq)) return;
    await activateConversationDetail(detail);
  }

  async function handleSelectProject(projectId) {
    const project = workspaceState.projects.find((item) => item.id === projectId);
    const firstConversation = project?.conversations[0];
    if (firstConversation) {
      await handleSelectConversation(projectId, firstConversation.id);
      return;
    }
    await handleAddConversation(projectId);
  }

  function handleToggleProject(projectId) {
    setWorkspaceState((state) => ({
      ...state,
      projects: state.projects.map((project) => (
        project.id === projectId ? { ...project, expanded: !project.expanded } : project
      )),
    }));
  }

  function handleToggleConversation(projectId, nextConversationId) {
    setWorkspaceState((state) => ({
      ...state,
      projects: state.projects.map((project) => project.id === projectId ? {
        ...project,
        conversations: project.conversations.map((conversation) => (
          conversation.id === nextConversationId ? { ...conversation, expanded: !conversation.expanded } : conversation
        )),
      } : project),
    }));
  }

  function handleToggleConversationTasks(projectId, nextConversationId) {
    setWorkspaceState((state) => ({
      ...state,
      projects: state.projects.map((project) => project.id === projectId ? {
        ...project,
        conversations: project.conversations.map((conversation) => (
          conversation.id === nextConversationId ? { ...conversation, tasksExpanded: !conversation.tasksExpanded } : conversation
        )),
      } : project),
    }));
  }

  async function createConversationInProject(project, title) {
    const createResponse = await fetch(`${API_BASE}/api/conversations`, {
      method: 'POST',
      headers: buildApiHeaders(),
      body: JSON.stringify({ title }),
    });
    if (!createResponse.ok) {
      throw new Error(`conversation create failed: ${createResponse.status}`);
    }
    let detail = await createResponse.json();
    if (project?.workspacePath) {
      const updateResponse = await fetch(`${API_BASE}/api/conversations/${detail.conversation_id}`, {
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
    const createResponse = await fetch(`${API_BASE}/api/conversations`, {
      method: 'POST',
      headers: buildApiHeaders(),
      body: JSON.stringify({ title: DEFAULT_SESSION_NAME }),
    });
    if (!createResponse.ok) {
      throw new Error(`project conversation create failed: ${createResponse.status}`);
    }
    const created = await createResponse.json();
    const pickResponse = await fetch(`${API_BASE}/api/conversations/${created.conversation_id}/workspace/pick`, {
      method: 'POST',
      headers: {
        'X-Agent-User-Id': userIdRef.current,
      },
    });
    if (pickResponse.status === 409) {
      await fetch(`${API_BASE}/api/conversations/${created.conversation_id}`, {
        method: 'DELETE',
        headers: {
          'X-Agent-User-Id': userIdRef.current,
        },
      });
      showToast('info', 'workspace selection cancelled');
      return;
    }
    if (!pickResponse.ok) {
      throw new Error(`workspace pick failed: ${pickResponse.status}`);
    }
    const detail = await pickResponse.json();
    if (!detail.workspace_path) {
      await fetch(`${API_BASE}/api/conversations/${created.conversation_id}`, {
        method: 'DELETE',
        headers: {
          'X-Agent-User-Id': userIdRef.current,
        },
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
    const response = await fetch(`${API_BASE}/api/conversations/${nextConversationId}`, {
      method: 'DELETE',
      headers: {
        'X-Agent-User-Id': userIdRef.current,
      },
    });
    if (!response.ok && response.status !== 404) {
      throw new Error(`conversation delete failed: ${response.status}`);
    }
    let fallbackConversation = project.conversations.find((conversation) => conversation.id !== nextConversationId);
    if (!fallbackConversation) {
      const detail = await createConversationInProject(project, project.id === DEFAULT_PROJECT_ID ? DEFAULT_SESSION_NAME : 'New Conversation');
      setWorkspaceState((state) => ({
        ...state,
        projects: state.projects.map((item) => item.id === projectId ? {
          ...item,
          conversations: item.conversations.filter((conversation) => conversation.id !== nextConversationId),
        } : item),
      }));
      await activateConversationDetail(detail, { restoreLatest: false });
      return;
    }
    setWorkspaceState((state) => ({
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
    const response = await fetch(`${API_BASE}/api/conversations/${nextConversationId}`, {
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
    await Promise.all(project.conversations.map((item) => fetch(`${API_BASE}/api/conversations/${item.id}`, {
      method: 'DELETE',
      headers: {
        'X-Agent-User-Id': userIdRef.current,
      },
    })));
    const nextState = {
      ...workspaceState,
      projects: workspaceState.projects.filter((item) => item.id !== projectId),
      activeProjectId: DEFAULT_PROJECT_ID,
      activeConversationId: null,
    };
    setWorkspaceState(nextState);
    const defaultProject = nextState.projects.find((item) => item.id === DEFAULT_PROJECT_ID) || createDefaultProject();
    if (defaultProject.conversations[0]) {
      const detail = await fetchConversationDetail(defaultProject.conversations[0].id);
      await activateConversationDetail(detail);
    } else {
      const detail = await createConversationInProject(defaultProject, DEFAULT_SESSION_NAME);
      await activateConversationDetail(detail, { restoreLatest: false });
    }
  }

  function handleOpenTaskReport(task) {
    const result = String(task?.answerText || '').trim();
    if (!result) return;
    setHollow({
      title: task?.title || 'Final Report',
      result,
      taskId: task?.taskId || task?.id || null,
    });
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
  const panelWorkspaceState = useMemo(() => ({
    ...workspaceState,
    projects: workspaceState.projects.map((project) => ({
      ...project,
      conversations: project.conversations.map((item) => (
        item.id === conversationId ? { ...item, tasks: quests } : item
      )),
    })),
  }), [workspaceState, conversationId, quests]);
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
      if (task.title) {
        rows.push({
          id: `${taskId}-user`,
          role: 'user',
          text: task.title,
          status: normalizeTaskStatus(task.status),
          createdAt: task.createdAt,
          completedAt: task.completedAt,
        });
      }
      const status = normalizeTaskStatus(task.status);
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
        // While streaming: text comes from inline timeline text segments,
        // so the bubble's `text` stays empty to avoid double-rendering.
        // When done: `text` holds the final markdown answer.
        const bubbleText = streaming
          ? ''
          : (error || answer || (status === 'cancelled' ? 'Task was cancelled.' : ''));
        rows.push({
          id: `${taskId}-agent`,
          role: 'agent',
          text: bubbleText,
          progressLines,
          traceTimeline: timeline?.items || [],
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
      rows.push({
        id: `${worldTaskState.pendingTask.id || 'pending'}-user`,
        role: 'user',
        text: worldTaskState.pendingTask.title,
        status: pendingStatus,
        createdAt: worldTaskState.pendingTask.createdAt,
        completedAt: worldTaskState.pendingTask.completedAt,
      });
      if (pendingError || pendingStatus === 'failed' || pendingStatus === 'cancelled' || pendingStatus === 'running' || pendingStatus === 'queued') {
        const pendingStreaming = (pendingStatus === 'running' || pendingStatus === 'queued') && !pendingError;
        rows.push({
          id: `${worldTaskState.pendingTask.id || 'pending'}-agent`,
          role: 'agent',
          text: pendingStreaming ? '' : (pendingError || (pendingStatus === 'cancelled' ? 'Task was cancelled.' : '')),
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

  const activeIds = getIdsForTarget(calibrationTarget);
  const activeDrafts = getDraftsForTarget(calibrationTarget);
  const calibrationExport = calibrationTarget === 'routes' ? `${serializePointMap('NAV_POINTS', window.NAV_POINT_IDS, navDrafts)}\n\n${serializePointMap('MEET_POINTS', window.MEET_POINT_IDS, meetDrafts)}` : calibrationTarget === 'nav' ? serializePointMap('NAV_POINTS', activeIds, navDrafts) : calibrationTarget === 'meet' ? serializePointMap('MEET_POINTS', activeIds, meetDrafts) : serializePointMap('STATIONS', activeIds, stationDrafts, true);
  const selectedPoseLabel = window.CHAR_DEFS[selectedPoseNpcId]?.name || selectedPoseNpcId;
  const routeEditorIds = window.ROUTE_EDITOR_IDS || [];
  const selectedPoseMapping = POSE_MAPPING_FIELDS.find((item) => item.key === selectedPoseMappingKey) || POSE_MAPPING_FIELDS[0];
  const selectedMappingFrame = getPoseMappingValue(selectedPoseNpcId, selectedPoseMapping.key);
  const selectedPoseFrameOptions = getPoseFrameOptions(selectedPoseNpcId);
  const poseExport = serializePoseConfigMap(window.CALIBRATION_IDS, getCharPoseConfig);
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

  return (
    <div className="app-shell">
      <window.TopBar
        now={now}
        viewMode={viewMode}
        onToggleViewMode={() => {
          setActiveTab('dashboard');
          setViewMode((mode) => (mode === 'chat' ? 'world' : 'chat'));
        }}
        calibrationActive={calibrationMode}
        onToggleCalibration={handleToggleCalibration}
        calibrationDisabled={busy}
      />
      <div className={`app-body ${viewMode === 'chat' ? 'chat-mode' : 'world-mode'}`}>
        {activeTab === 'dashboard' ? (
          <>
            <window.ConversationsPanel
              workspaceState={panelWorkspaceState}
              now={now}
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
              onOpenTaskReport={handleOpenTaskReport}
            />
            {viewMode === 'chat' ? (
              <div className="app-chat-stage">
                <div className="app-chat-main">
                  <window.ChatPanel
                    messages={chatMessages}
                    running={busy}
                    disabled={busy || uploadState.active || calibrationMode || !conversationReady || !!conversationError}
                    onSend={(text, attachment, modelId, reasoningEffort) => handleDeploy(text, attachment, modelId, reasoningEffort)}
                    onStop={handleStop}
                    onSelectFile={(file) => { handleAttachmentSelect(file).catch((error) => console.error('attachment upload failed', error)); }}
                    onClearFile={handleAttachmentClear}
                    attachment={composerAttachment}
                    uploading={uploadState.active}
                    contextUsage={contextUsage}
                    workspacePath={localWorkspace.path}
                    activeTaskText={activeTaskText}
                    now={now}
                    modelOptions={modelOptions}
                    defaultModelId={defaultModelId}
                    modelLoading={providerLoading}
                  />
                </div>
                <window.BottomNav active={activeTab} onChange={setActiveTab} />
              </div>
            ) : (
              <>
                <div className="app-center-stage">
                  <window.MapViewport
                    MAP_W={MAP_W}
                    MAP_H={MAP_H}
                    onViewChange={setMapView}
                    overlay={<window.TaskDelegation onDeploy={handleDeploy} onStop={handleStop} onSelectFile={(file) => { handleAttachmentSelect(file).catch((error) => console.error('attachment upload failed', error)); }} onClearFile={handleAttachmentClear} attachment={composerAttachment} uploading={uploadState.active} running={busy} disabled={busy || uploadState.active || calibrationMode || !conversationReady || !!conversationError} contextUsage={contextUsage} workspacePath={localWorkspace.path} activeTaskText={activeTaskText} modelOptions={modelOptions} defaultModelId={defaultModelId} modelLoading={providerLoading} />}
                  >
                    <div ref={stageRef} className="office-map">
                      {calibrationMode && calibrationTarget === 'routes' && selectedRouteId && <window.CalibrationRoutePreview routeId={selectedRouteId} mapW={MAP_W} mapH={MAP_H} />}
                      {Object.keys(window.STATIONS).map(id => <window.NPC key={id} id={id} state={npcStates[id]} spriteConfig={getCharPoseConfig(id)} mapW={MAP_W} mapH={MAP_H} showLabel={true} interactive={calibrationMode && !busy && calibrationTarget === 'stations'} selected={(selectedMarkerId === id && calibrationTarget === 'stations') || (selectedPoseNpcId === id && calibrationTarget === 'poses')} showDebug={calibrationMode && (calibrationTarget === 'stations' || (calibrationTarget === 'poses' && selectedPoseNpcId === id))} debugText={calibrationTarget === 'poses' ? `${(npcStates[id]?.poseDebug?.pose || 'idle').toUpperCase()} · ${(npcStates[id]?.poseDebug?.dir || 'front').toUpperCase()}` : `${(stationDrafts[id]?.x??0).toFixed(3)}, ${(stationDrafts[id]?.y??0).toFixed(3)}`} onPointerDown={(npcId, e) => handleMarkerPointerDown('stations', npcId, e)} />)}
                      {calibrationMode && calibrationTarget === 'routes' && activeIds.map((id, index) => <window.CalibrationPoint key={`${calibrationTarget}-${id}`} id={id} point={activeDrafts[id]} mapW={MAP_W} mapH={MAP_H} kind={resolvePointTarget(id)==='meet'?'meet':'nav'} selected={selectedMarkerId===id} showDebug={true} badgeText={index+1} onPointerDown={(pId, e) => handleMarkerPointerDown(calibrationTarget, pId, e)} />)}
                      <div className="fx-layer">{bursts.map(b => <div key={b.id} className="fx-ring" style={{ left: b.x, top: b.y, borderColor: b.color, boxShadow: `0 0 12px ${b.color}` }} />)}</div>
                    </div>
                  </window.MapViewport>
                  <window.BottomNav active={activeTab} onChange={setActiveTab} />
                </div>
                <window.LiveFeedPanel agentLive={agentLive} now={now} extensionStyle={rightPanelExtensionStyle} currentTask={currentTask} />
              </>
            )}
          </>
        ) : (
          <div className="app-tab-stage">
            <div className="app-tab-main">
              <window.TabPlaceholder name={activeTab} />
            </div>
            <window.BottomNav active={activeTab} onChange={setActiveTab} />
          </div>
        )}
      </div>

      {calibrationMode && (
        <div className={`calibration-panel ${calibrationTarget === 'routes' ? 'route-mode' : calibrationTarget === 'poses' ? 'pose-mode' : ''}`}>
          <div className="calibration-panel-header">
            <span className="calibration-panel-title">Settings</span>
            <button
              type="button"
              className="calibration-panel-close"
              onClick={handleToggleCalibration}
              aria-label="Close settings"
              title="Close"
            >
              <span className="calibration-panel-close-glyph" aria-hidden="true">×</span>
            </button>
          </div>
          <div className="calibration-tabs">
            <button className={calibrationTarget==='stations'?'active':''} onClick={()=>setCalibrationTarget('stations')}>STATIONS</button>
            <button className={calibrationTarget==='routes'?'active':''} onClick={()=>setCalibrationTarget('routes')}>ROUTES</button>
            <button className={calibrationTarget==='poses'?'active':''} onClick={()=>{ setCalibrationTarget('poses'); setSelectedPoseSourceKey(null); syncPosePreview(selectedPoseNpcId, selectedPoseMappingKey); }}>POSES</button>
          </div>
          {calibrationTarget === 'poses' ? (
            <>
              <div className="calibration-head">
                <div>
                  <div className="title">POSE DEBUG</div>
                  <div className="sub">Three steps: pick a character, pick which action state you want to change, then click the frame source you want to use. The map preview updates automatically.</div>
                </div>
                <div className="badge">{selectedPoseLabel}</div>
              </div>
              <div className="calibration-point-picker">
                <div className="calibration-point-picker-head">
                  <span>Character</span>
                  <code>{selectedPoseNpcId}</code>
                </div>
                <div className="calibration-option-grid calibration-option-grid-characters">
                  {window.CALIBRATION_IDS.map((id) => (
                    <button
                      key={id}
                      className={`calibration-option-chip ${selectedPoseNpcId === id ? 'selected' : ''}`}
                      onClick={() => {
                        setSelectedPoseNpcId(id);
                        setSelectedPoseSourceKey(null);
                        syncPosePreview(id, selectedPoseMappingKey);
                      }}
                    >
                      <strong>{window.CHAR_DEFS[id]?.name || id}</strong>
                      <span>{id}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="calibration-point-picker">
                <div className="calibration-point-picker-head">
                  <span>Action To Change</span>
                  <code>{selectedPoseMapping.key}</code>
                </div>
                <div className="calibration-option-grid">
                  {POSE_MAPPING_FIELDS.map((field) => (
                    <button
                      key={field.key}
                      className={`calibration-option-chip ${selectedPoseMapping.key === field.key ? 'selected' : ''}`}
                      onClick={() => {
                        setSelectedPoseMappingKey(field.key);
                        setSelectedPoseSourceKey(null);
                        syncPosePreview(selectedPoseNpcId, field.key);
                      }}
                    >
                      <strong>{field.label}</strong>
                      <span>{field.type}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="calibration-point-picker">
                <div className="calibration-point-picker-head">
                  <span>Use This Frame</span>
                  <code>{selectedPoseSourceKey ? 'selected' : `current ${selectedMappingFrame ?? '-'}`}</code>
                </div>
                <div className="calibration-option-grid">
                  {selectedPoseFrameOptions.map((option) => {
                    const sourceFrame = option.frame;
                    return (
                      <button
                        key={`mapping-${option.sourceKey}`}
                        className={`calibration-option-chip ${selectedPoseSourceKey === option.sourceKey ? 'selected' : ''}`}
                        onClick={() => {
                          applyPoseMapping(selectedPoseNpcId, selectedPoseMapping.key, sourceFrame);
                          setSelectedPoseSourceKey(option.sourceKey);
                          syncPosePreview(selectedPoseNpcId, selectedPoseMapping.key);
                        }}
                      >
                        <strong>{option.label}</strong>
                        <span>{option.group} · frame {sourceFrame ?? '-'}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="calibration-point-picker">
                <div className="calibration-point-picker-head">
                  <span>Preview</span>
                  <code>{selectedPoseLabel}</code>
                </div>
                <div className="calibration-pose-summary">
                  <span>Now Editing</span>
                  <code>{selectedPoseMapping.label} · frame {selectedMappingFrame ?? '-'}</code>
                </div>
              </div>
              <textarea className="calibration-export" readOnly value={poseExport} />
              <div className="calibration-actions">
                <button onClick={async ()=>{ try { await navigator.clipboard.writeText(poseExport); setCopiedCoords(true); setTimeout(()=>setCopiedCoords(false), 1500); } catch(e){} }}>{copiedCoords?'COPIED':'COPY'}</button>
                <button onClick={() => updateNpc(selectedPoseNpcId, { poseDebug: null })}>CLEAR CURRENT</button>
                <button onClick={() => resetPoseMapping(selectedPoseNpcId)}>RESET MAPPING</button>
                <button className="ghost" onClick={handleResetCalibration}>RESET ALL</button>
              </div>
            </>
          ) : (
            <>
              <div className="calibration-head"><div><div className="title">CALIBRATION</div><div className="sub">{calibrationTarget === 'routes' ? 'Choose a route, then drag its points on the map. Copy the updated route coordinates below.' : 'Drag points on the map. Copy the coordinates below to your code.'}</div></div><div className="badge">{calibrationTarget === 'routes' ? selectedRouteId : selectedMarkerId}</div></div>
              {calibrationTarget === 'routes' ? (
                <>
                  <div className="calibration-routes">
                    <div className="calibration-route-head">
                      <span>Route</span>
                      <code>{routeEditorIds.length} total</code>
                    </div>
                    <div className="calibration-route-list">
                      {routeEditorIds.map((routeId) => {
                        const routeRefs = window.ROUTE_EDITOR_DEFS?.[routeId]?.refs || window.ROUTES?.[routeId] || [];
                        return (
                          <button
                            key={routeId}
                            className={`calibration-route-row ${selectedRouteId === routeId ? 'selected' : ''}`}
                            onClick={() => {
                              setSelectedRouteId(routeId);
                              const firstRef = getFirstRouteRef(routeId);
                              if (firstRef) setSelectedMarkerId(firstRef);
                            }}
                          >
                            <span>{window.ROUTE_EDITOR_DEFS?.[routeId]?.label || routeId}</span>
                            <code>{routeRefs.join(' -> ')}</code>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="calibration-point-picker">
                    <div className="calibration-point-picker-head">
                      <span>Points In Route</span>
                      <code>{activeIds.length} refs</code>
                    </div>
                    <div className="calibration-list">
                      {activeIds.map(id => (
                        <button
                          key={id}
                          className={`calibration-row ${selectedMarkerId===id?'selected':''}`}
                          onClick={()=>setSelectedMarkerId(id)}
                        >
                          <span>{getPointDisplayName(calibrationTarget,id)}</span>
                          <code>{activeDrafts[id].x.toFixed(3)}, {activeDrafts[id].y.toFixed(3)}</code>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="calibration-list">{activeIds.map(id => <button key={id} className={`calibration-row ${selectedMarkerId===id?'selected':''}`} onClick={()=>setSelectedMarkerId(id)}><span>{getPointDisplayName(calibrationTarget,id)}</span><code>{activeDrafts[id].x.toFixed(3)}, {activeDrafts[id].y.toFixed(3)}</code></button>)}</div>
              )}
              <textarea className="calibration-export" readOnly value={calibrationExport} />
              <div className="calibration-actions"><button onClick={async ()=>{ try { await navigator.clipboard.writeText(calibrationExport); setCopiedCoords(true); setTimeout(()=>setCopiedCoords(false), 1500); } catch(e){} }}>{copiedCoords?'COPIED':'COPY'}</button><button className="ghost" onClick={handleResetCalibration}>RESET</button></div>
            </>
          )}
        </div>
      )}

      {toast && (
        <div className={`app-toast app-toast-${toast.kind}`} role="status" aria-live="polite">
          {toast.kind === 'success'
            ? <span className="app-toast-icon app-toast-icon-success" aria-hidden="true" />
            : <span className="app-toast-icon app-toast-icon-error" aria-hidden="true">!</span>}
          <span className="app-toast-message">{toast.message}</span>
        </div>
      )}

      <window.HollowPurple open={!!hollow} title={hollow?.title} result={hollow?.result} onClose={()=>setHollow(null)} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
