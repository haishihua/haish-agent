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
const STREAM_EVENT_BATCH_MS = 80;
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
  'context_compaction_started': { actor: 'okabe', kind: 'llm', bubble: 'Auto-Compacting context' },
  'context_compaction_completed': { actor: 'okabe', kind: 'llm', bubble: 'Auto-Compacting context' },
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
  'context_compaction_started',
  'context_compaction_completed',
  'llm_thinking_started',
  'llm_thinking_completed',
  'agent_progress_delta',
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
  'context_compaction_started',
  'context_compaction_completed',
  'context_usage_updated',
  'run_finished',
  'run_error',
  'run_cancelled',
]);

const STREAM_IMMEDIATE_EVENT_TYPES = new Set([
  'context_compaction_started',
  'context_compaction_completed',
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
  'agent_progress_delta',
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
  context_compaction_started: 'CONTEXT',
  context_compaction_completed: 'CONTEXT',
  llm_thinking_started: 'THINKING',
  llm_thinking_completed: 'READY',
  agent_progress_delta: 'PROGRESS',
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
  const displayText = stripChatImageAugmentation(text).text;
  return displayText ? `Triggered by user input: ${displayText}` : 'Triggered by user input.';
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
    usedTokens: raw.usedTokens ?? payload.usedTokens ?? raw.used_tokens ?? payload.used_tokens ?? null,
    totalTokens: raw.totalTokens ?? payload.totalTokens ?? raw.total_tokens ?? payload.total_tokens ?? null,
    context_used_tokens: raw.context_used_tokens ?? payload.context_used_tokens ?? raw.used_tokens ?? payload.used_tokens ?? null,
    context_total_tokens: raw.context_total_tokens ?? payload.context_total_tokens ?? raw.total_tokens ?? payload.total_tokens ?? null,
    compressed_count: raw.compressed_count ?? payload.compressed_count ?? 0,
    compressed: Boolean(raw.compressed ?? payload.compressed),
    source: raw.source ?? payload.source ?? null,
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
    parentCallId: event.parent_call_id || event.parentCallId || null,
    toolName: event.tool_name || null,
    toolGroup: event.tool_group || null,
    kind: event.kind || null,
    role: event.role || event.sub_agent_role || null,
    executorRole: event.executor_role || null,
    executorActorId: event.executor_actor_id || null,
    inputSummary: event.input_summary || '',
    outputSummary: event.output_summary || '',
    toolInput: event.tool_input || null,
    toolResponse: event.tool_response || null,
    toolOutput: event.tool_output || '',
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
const CONVERSATION_STORAGE_KEY = 'agent_world_conversation_id';
const WORKSPACE_STORAGE_KEY = 'agent_world_workspaces_v2';
const CONTEXT_USAGE_STORAGE_KEY = 'agent_world_context_usage_v1';
const AUTH_SESSION_STORAGE_KEY = 'haish_auth_session_v1';
const DEFAULT_CONTEXT_TOTAL_TOKENS = 128000;
const RESTORED_CONTEXT_BASE_TOKENS = 4200;
const DEFAULT_PROJECT_ID = 'default-project';
const DEFAULT_PROJECT_NAME = 'Default project';
const DEFAULT_SESSION_NAME = 'Default Session';
const DEFAULT_CONVERSATION_NAMES = new Set([DEFAULT_SESSION_NAME, 'New Chat', 'New Conversation', 'Untitled Chat']);

function readStoredJson(storage, key) {
  try {
    const raw = storage?.getItem?.(key);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

function clearStoredAuthSession() {
  window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
  window.sessionStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
}

function loadStoredAuthSession() {
  const localSession = readStoredJson(window.localStorage, AUTH_SESSION_STORAGE_KEY);
  if (localSession?.accessToken || localSession?.refreshToken) return { ...localSession, remember: true };
  const sessionSession = readStoredJson(window.sessionStorage, AUTH_SESSION_STORAGE_KEY);
  if (sessionSession?.accessToken || sessionSession?.refreshToken) return { ...sessionSession, remember: false };
  return null;
}

let authMemorySession = loadStoredAuthSession();
let authRefreshPromise = null;

function normalizeAuthPayload(payload, remember = true) {
  const accessToken = String(payload?.access_token || payload?.accessToken || '').trim();
  const refreshToken = String(payload?.refresh_token || payload?.refreshToken || '').trim();
  if (!accessToken || !refreshToken) {
    throw new Error('Authentication response did not include tokens.');
  }
  const expiresIn = Number(payload?.expires_in || payload?.expiresIn || 0) || 0;
  return {
    accessToken,
    refreshToken,
    tokenType: String(payload?.token_type || payload?.tokenType || 'bearer').toLowerCase(),
    expiresAt: expiresIn > 0 ? Date.now() + expiresIn * 1000 : null,
    user: payload?.user || null,
    remember: Boolean(remember),
  };
}

function saveAuthSession(payload, remember = true) {
  const session = normalizeAuthPayload(payload, remember);
  authMemorySession = session;
  clearStoredAuthSession();
  const storage = session.remember ? window.localStorage : window.sessionStorage;
  storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session));
  return session;
}

function updateAuthSessionUser(user) {
  if (!authMemorySession) return null;
  authMemorySession = { ...authMemorySession, user };
  clearStoredAuthSession();
  const storage = authMemorySession.remember ? window.localStorage : window.sessionStorage;
  storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(authMemorySession));
  return authMemorySession;
}

function clearAuthSession({ notify = true } = {}) {
  authMemorySession = null;
  clearStoredAuthSession();
  if (notify) {
    window.dispatchEvent(new CustomEvent('haish-auth-expired'));
  }
}

function getAuthAccessToken() {
  return String(authMemorySession?.accessToken || '').trim();
}

function getAuthRefreshToken() {
  return String(authMemorySession?.refreshToken || '').trim();
}

function buildAuthHeaders(extraHeaders = {}, { json = true } = {}) {
  const headers = new Headers(extraHeaders || {});
  if (json && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const token = getAuthAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return Object.fromEntries(headers.entries());
}

function withAuthInit(init = {}, options = {}) {
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;
  return {
    ...init,
    headers: buildAuthHeaders(init.headers, { json: options.json !== false && !isFormData }),
  };
}

function buildApiHeaders(extraHeaders = {}) {
  return buildAuthHeaders(extraHeaders);
}

function dispatchAuthExpired() {
  clearAuthSession({ notify: true });
}

async function parseResponseMessage(response, fallback) {
  try {
    const payload = await response.json();
    const detail = payload?.detail;
    if (typeof detail === 'string' && detail.trim()) return detail.trim();
    if (Array.isArray(detail) && detail.length > 0) {
      return detail.map((item) => item?.msg || item?.message || String(item)).join(' ');
    }
    if (typeof payload?.message === 'string' && payload.message.trim()) return payload.message.trim();
  } catch (error) {
    // Keep the fallback when the server returns an empty or non-JSON response.
  }
  return fallback;
}

async function refreshAuthSession() {
  if (authRefreshPromise) return authRefreshPromise;
  authRefreshPromise = (async () => {
    const refreshToken = getAuthRefreshToken();
    if (!refreshToken) throw new Error('No refresh token is available.');
    const remember = authMemorySession?.remember ?? true;
    const response = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!response.ok) {
      const message = await parseResponseMessage(response, `refresh failed: ${response.status}`);
      clearAuthSession({ notify: false });
      throw new Error(message);
    }
    const payload = await response.json();
    return saveAuthSession(payload, remember);
  })().finally(() => {
    authRefreshPromise = null;
  });
  return authRefreshPromise;
}

async function authFetch(input, init = {}, options = {}) {
  const response = await fetch(input, withAuthInit(init, options));
  if (response.status !== 401 || options.skipRefresh) return response;
  if (!getAuthRefreshToken()) return response;
  try {
    await refreshAuthSession();
  } catch (error) {
    dispatchAuthExpired();
    return response;
  }
  if (init.signal?.aborted) return response;
  return fetch(input, withAuthInit(init, options));
}

async function requestAuthJson(path, payload) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const message = await parseResponseMessage(response, `request failed: ${response.status}`);
    throw new Error(message);
  }
  return response.json();
}

function accountToRegisterPayload(account, password) {
  const normalized = String(account || '').trim();
  const isEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized);
  const baseName = isEmail ? normalized.split('@', 1)[0] : normalized;
  return {
    username: isEmail ? undefined : normalized,
    email: isEmail ? normalized : undefined,
    password,
    display_name: baseName || 'User',
  };
}

async function loginWithPassword(account, password, remember) {
  const payload = await requestAuthJson('/api/auth/login', { account, password });
  return saveAuthSession(payload, remember);
}

async function registerWithPassword(account, password, remember) {
  const payload = await requestAuthJson('/api/auth/register', accountToRegisterPayload(account, password));
  return saveAuthSession(payload, remember);
}

async function registerNewAccount({ userName, email, password }, remember) {
  const trimmedName = String(userName || '').trim();
  const trimmedEmail = String(email || '').trim();
  const payload = await requestAuthJson('/api/auth/register', {
    username: trimmedName || undefined,
    email: trimmedEmail || undefined,
    password,
    display_name: trimmedName || (trimmedEmail ? trimmedEmail.split('@', 1)[0] : 'User'),
  });
  return saveAuthSession(payload, remember);
}

async function fetchCurrentAuthUser() {
  const response = await authFetch(`${API_BASE}/api/auth/me`, { method: 'GET' }, { json: false });
  if (!response.ok) {
    const message = await parseResponseMessage(response, `session check failed: ${response.status}`);
    throw new Error(message);
  }
  const user = await response.json();
  updateAuthSessionUser(user);
  return user;
}

async function logoutCurrentSession() {
  const refreshToken = getAuthRefreshToken();
  if (refreshToken) {
    await fetch(`${API_BASE}/api/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    }).catch(() => undefined);
  }
  clearAuthSession({ notify: false });
}

function normalizeContextUsage(value, fallbackConversationId = null) {
  const rawUsedTokens = Math.max(0, Math.round(Number(value?.contextUsedTokens ?? value?.context_used_tokens ?? value?.usedTokens ?? value?.used_tokens ?? 0) || 0));
  const totalTokens = Math.max(1, Math.round(Number(value?.contextTotalTokens ?? value?.context_total_tokens ?? value?.totalTokens ?? value?.total_tokens ?? value?.effective_budget ?? DEFAULT_CONTEXT_TOTAL_TOKENS) || DEFAULT_CONTEXT_TOTAL_TOKENS));
  const usedTokens = rawUsedTokens > totalTokens ? 0 : rawUsedTokens;
  const compressedCount = Math.max(0, Math.round(Number(value?.compressedCount ?? value?.compressed_count ?? 0) || 0));
  return {
    conversationId: value?.conversationId || value?.conversation_id || fallbackConversationId || null,
    usedTokens,
    totalTokens,
    ratio: Math.max(0, Math.min(1, totalTokens > 0 ? usedTokens / totalTokens : 0)),
    compressed: Boolean(value?.compressed) || compressedCount > 0,
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
    createdAt: null,
    updatedAt: null,
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
        createdAt: project.createdAt || project.created_at || null,
        updatedAt: project.updatedAt || project.updated_at || null,
        // `userExpanded` is the sole source of truth for sidebar expansion.
        // Activation handlers set it to true on the active project / conversation;
        // chevron toggle flips it; everything else remains in whatever state the
        // user last left it. We intentionally drop the legacy `expanded` field
        // on load so old snapshots don't carry forward "every project expanded".
        userExpanded: typeof project.userExpanded === 'boolean' ? project.userExpanded : undefined,
        conversations: Array.isArray(project.conversations)
          ? project.conversations.map((conversation) => ({
            id: conversation.id,
            name: conversation.name || DEFAULT_SESSION_NAME,
            tasks: Array.isArray(conversation.tasks) ? conversation.tasks : [],
            createdAt: conversation.createdAt || conversation.created_at || null,
            updatedAt: conversation.updatedAt || conversation.updated_at || null,
            userExpanded: typeof conversation.userExpanded === 'boolean' ? conversation.userExpanded : undefined,
            tasksExpanded: Boolean(conversation.tasksExpanded),
          })).filter((conversation) => conversation.id)
          : [],
      };
    });
    return normalizeWorkspaceOrdering({
      projects,
      activeProjectId: parsed.activeProjectId || DEFAULT_PROJECT_ID,
      activeConversationId: parsed.activeConversationId || getStoredConversationId(),
    });
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
  return DEFAULT_CONVERSATION_NAMES.has(normalized)
    || /^New Chat \d+$/.test(normalized)
    || /^New Conversation \d+$/.test(normalized);
}

function titleFromTaskText(text, maxLength = 48) {
  const normalized = stripChatImageAugmentation(text).text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function stripChatImageAugmentation(value) {
  const raw = String(value || '');
  const imageRefs = [];
  const withoutMarkers = raw.replace(/^\s*\[user attached image #(\d+):\s*([^\]]+)\]\s*$/gim, (_match, index, path) => {
    const cleanPath = String(path || '').trim();
    if (cleanPath) {
      imageRefs.push({
        image_id: `restored-image-${index}-${cleanPath}`,
        path: cleanPath,
        mime: null,
      });
    }
    return '';
  });
  const hintIndex = withoutMarkers.search(/\n*\s*The user attached the image\(s\) above\./i);
  const text = (hintIndex >= 0 ? withoutMarkers.slice(0, hintIndex) : withoutMarkers)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { text, imageRefs };
}

function chatImagePreviewUrl(ref, conversationId, ownerId = '') {
  const existing = String(ref?.previewUrl || '').trim();
  if (existing) return existing;
  const path = String(ref?.path || '').trim();
  if (!path || !conversationId) return '';
  if (/^(blob:|data:|https?:|file:)/i.test(path)) return path;
  const params = new URLSearchParams({ image_path: path });
  if (ownerId) params.set('owner_id', ownerId);
  return `${API_BASE}/api/conversations/${encodeURIComponent(conversationId)}/messages/images/preview?${params.toString()}`;
}

function isProtectedChatImagePreviewUrl(value) {
  const url = String(value || '');
  return url.includes('/api/conversations/') && url.includes('/messages/images/preview');
}

function normalizeChatImageRefs(refs, conversationId, ownerId = '') {
  return (Array.isArray(refs) ? refs : [])
    .filter((ref) => ref && (ref.path || ref.previewUrl))
    .map((ref, index) => {
      const previewUrl = chatImagePreviewUrl(ref, conversationId, ownerId);
      const authPreviewUrl = isProtectedChatImagePreviewUrl(previewUrl) ? previewUrl : '';
      return {
        image_id: ref.image_id || ref.imageId || `image-${index}`,
        path: ref.path || '',
        mime: ref.mime || null,
        previewUrl: authPreviewUrl ? '' : previewUrl,
        authPreviewUrl,
      };
    });
}

function mergeChatImageRefs(...groups) {
  // 去重以 path 为优先 key——同一张图被多个源头（服务端记录 / 消息标记还原 /
  // 上一轮客户端 state）各自合成的 image_id 不同，但 path 是真正稳定的"内容标识"。
  // 历史实现按 image_id 优先，导致重启恢复 task 时 2 张图被算成 4 张。
  const seen = new Set();
  const merged = [];
  groups.flat().forEach((ref) => {
    if (!ref) return;
    const path = String(ref.path || '').trim();
    const key = path || ref.image_id || ref.previewUrl;
    if (!key || seen.has(key)) return;
    seen.add(key);
    merged.push(ref);
  });
  return merged;
}

function chatImageFallbacksByTaskIdFromMessages(messages, conversationId, ownerId = '') {
  const map = new Map();
  for (const message of Array.isArray(messages) ? messages : []) {
    if (!message || message.role !== 'user' || !message.task_id) continue;
    const parsed = stripChatImageAugmentation(message.content);
    if (parsed.imageRefs.length === 0) continue;
    const existing = map.get(message.task_id) || [];
    map.set(
      message.task_id,
      normalizeChatImageRefs(mergeChatImageRefs(existing, parsed.imageRefs), conversationId, ownerId),
    );
  }
  return map;
}

function timestampValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function taskUpdatedTimestamp(task) {
  if (!task) return 0;
  return Math.max(
    timestampValue(task.updatedAt),
    timestampValue(task.updated_at),
    timestampValue(task.completedAt),
    timestampValue(task.completed_at),
    timestampValue(task.createdAt),
    timestampValue(task.created_at),
  );
}

function taskCreatedTimestamp(task) {
  if (!task) return 0;
  return Math.max(
    timestampValue(task.createdAt),
    timestampValue(task.created_at),
  );
}

function conversationUpdatedTimestamp(conversation) {
  if (!conversation) return 0;
  const taskUpdatedAt = Array.isArray(conversation.tasks)
    ? conversation.tasks.reduce((latest, task) => Math.max(latest, taskUpdatedTimestamp(task)), 0)
    : 0;
  return Math.max(
    timestampValue(conversation.updatedAt),
    timestampValue(conversation.updated_at),
    timestampValue(conversation.createdAt),
    timestampValue(conversation.created_at),
    taskUpdatedAt,
  );
}

function projectUpdatedTimestamp(project) {
  if (!project) return 0;
  const conversationUpdatedAt = Array.isArray(project.conversations)
    ? project.conversations.reduce((latest, conversation) => Math.max(latest, conversationUpdatedTimestamp(conversation)), 0)
    : 0;
  return Math.max(
    timestampValue(project.updatedAt),
    timestampValue(project.updated_at),
    timestampValue(project.createdAt),
    timestampValue(project.created_at),
    conversationUpdatedAt,
  );
}

function inferProjectCreatedAt(project) {
  const directCreatedAt = project?.createdAt || project?.created_at;
  if (timestampValue(directCreatedAt)) return directCreatedAt;
  const conversations = Array.isArray(project?.conversations) ? project.conversations : [];
  let earliest = null;
  for (const conversation of conversations) {
    const createdAt = conversation?.createdAt || conversation?.created_at;
    const timestamp = timestampValue(createdAt);
    if (!timestamp) continue;
    if (!earliest || timestamp < earliest.timestamp) {
      earliest = { timestamp, createdAt };
    }
  }
  return earliest?.createdAt || null;
}

function projectCreatedTimestamp(project) {
  return timestampValue(inferProjectCreatedAt(project));
}

function withDefaultExpansion(project) {
  // The sidebar expansion is purely user-driven now: `userExpanded` is the
  // single source of truth. Activation handlers below set it to true on the
  // newly-selected project / conversation; the chevron toggle flips it; an
  // item the user has never touched stays collapsed. This stops the
  // previously-active project from auto-collapsing the moment the user
  // navigates to another conversation — the regression the user reported as
  // "click a project and the other projects/conversations get folded up".
  const conversations = Array.isArray(project.conversations)
    ? project.conversations.map((conversation) => {
      const tasks = Array.isArray(conversation.tasks) ? conversation.tasks : [];
      return {
        ...conversation,
        tasks,
        updatedAt: conversationUpdatedTimestamp({ ...conversation, tasks }) || conversation.updatedAt || null,
        expanded: conversation.userExpanded === true,
        tasksExpanded: Boolean(conversation.tasksExpanded),
      };
    })
    : [];
  return {
    ...project,
    conversations,
    createdAt: inferProjectCreatedAt({ ...project, conversations }),
    updatedAt: projectUpdatedTimestamp({ ...project, conversations }) || project.updatedAt || null,
    expanded: project.userExpanded === true,
  };
}

function conversationHasActiveTask(conversation) {
  const tasks = Array.isArray(conversation?.tasks) ? conversation.tasks : [];
  return tasks.some((task) => isTaskActuallyActive(task));
}

function isTaskActuallyActive(task) {
  const status = String(task?.status || '').toLowerCase();
  if (status !== 'running' && status !== 'queued') return false;
  // Server status alone is unreliable: a task may have already streamed
  // its answer and finished from the user's perspective, but the
  // persisted status wasn't transitioned (the user-facing symptom is
  // "no task is running but composer is locked"). Stronger "done"
  // signals override the raw running/queued state.
  if (task?.completedAt || task?.completed_at) return false;
  const answer = task?.answerText ?? task?.answer_text;
  if (typeof answer === 'string' && answer.trim().length > 0) return false;
  return true;
}

function normalizeWorkspaceOrdering(state) {
  const activeProjectId = state?.activeProjectId || DEFAULT_PROJECT_ID;
  const activeConversationId = state?.activeConversationId || getStoredConversationId();
  // Sidebar ordering policy (matches the UX brief):
  //   - Conversations: any conversation with a running/queued task floats
  //     to the top of its project. Once multiple conversations are in that
  //     running group, keep relative order stable. Idle conversations also
  //     keep their existing order; updatedAt and active highlighting do NOT
  //     participate in ordering, so clicking around does not reshuffle the
  //     list.
  //   - Projects: createdAt desc. Active project and later activity never
  //     participate in project ordering.
  const projects = (Array.isArray(state?.projects) ? state.projects : [])
    .map((project) => withDefaultExpansion(project))
    .map((project) => ({
      ...project,
      conversations: [...project.conversations].sort((a, b) => {
        const aActive = conversationHasActiveTask(a);
        const bActive = conversationHasActiveTask(b);
        if (aActive && !bActive) return -1;
        if (bActive && !aActive) return 1;
        return 0;
      }),
    }))
    .sort((a, b) => projectCreatedTimestamp(b) - projectCreatedTimestamp(a));
  return {
    ...(state || {}),
    projects: projects.length ? projects : [createDefaultProject()],
    activeProjectId,
    activeConversationId,
  };
}

function conversationDetailToWorkspaceConversation(detail, previousConversation = null) {
  const detailName = detail.title || detail.label || '';
  const previousName = previousConversation?.name || '';
  const shouldKeepLocalTitle = isDefaultConversationName(detailName)
    && previousName
    && !isDefaultConversationName(previousName);
  return {
    id: detail.conversation_id,
    name: shouldKeepLocalTitle ? previousName : (detailName || previousName || DEFAULT_SESSION_NAME),
    tasks: Array.isArray(detail.tasks) ? detail.tasks.map(taskSummaryToRuntimeTask) : [],
    createdAt: detail.created_at || previousConversation?.createdAt || null,
    updatedAt: detail.updated_at || detail.last_message_at || previousConversation?.updatedAt || null,
    // Preserve the user's explicit toggle when present; otherwise leave it
    // undefined and let withDefaultExpansion compute expanded from activeness.
    userExpanded: typeof previousConversation?.userExpanded === 'boolean'
      ? previousConversation.userExpanded
      : undefined,
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
    createdAt: previousProjects.get(DEFAULT_PROJECT_ID)?.createdAt || null,
    updatedAt: previousProjects.get(DEFAULT_PROJECT_ID)?.updatedAt || null,
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
        createdAt: previousProject?.createdAt || null,
        updatedAt: previousProject?.updatedAt || null,
        userExpanded: typeof previousProject?.userExpanded === 'boolean'
          ? previousProject.userExpanded
          : undefined,
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

  return normalizeWorkspaceOrdering({
    projects,
    activeProjectId: activeProject.id,
    activeConversationId,
  });
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
      const merged = conversationDetailToWorkspaceConversation(detail, conversation);
      return activate ? { ...merged, userExpanded: false } : merged;
    });
    return {
      ...project,
      workspacePath: projectId === DEFAULT_PROJECT_ID ? null : workspacePath,
      workspaceLabel: projectId === DEFAULT_PROJECT_ID ? null : projectLabel,
      userExpanded: activate ? true : project.userExpanded,
      conversations: conversationFound
        ? conversations
        : [
            ...conversations,
            (() => {
              const fresh = conversationDetailToWorkspaceConversation(detail);
              return activate ? { ...fresh, userExpanded: false } : fresh;
            })(),
          ],
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
      createdAt: detail.created_at || new Date().toISOString(),
      updatedAt: detail.updated_at || detail.last_message_at || new Date().toISOString(),
      userExpanded: activate ? true : undefined,
      conversations: [
        (() => {
          const fresh = conversationDetailToWorkspaceConversation(detail);
          return activate ? { ...fresh, userExpanded: false } : fresh;
        })(),
      ],
    });
  }
  return normalizeWorkspaceOrdering({
    projects,
    activeProjectId: activate ? projectId : state.activeProjectId,
    activeConversationId: activate ? detail.conversation_id : state.activeConversationId,
  });
}

function workspaceStateWithTouchedConversation(state, conversationId, patch = {}) {
  if (!conversationId) return normalizeWorkspaceOrdering(state);
  const now = Date.now();
  const definedPatch = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined)
  );
  let nextActiveProjectId = state.activeProjectId;
  const projects = state.projects.map((project) => {
    const hasConversation = project.conversations.some((conversation) => conversation.id === conversationId);
    if (hasConversation) nextActiveProjectId = project.id;
    return {
      ...project,
      updatedAt: hasConversation ? now : project.updatedAt,
      conversations: project.conversations.map((conversation) => (
        conversation.id === conversationId
          ? {
              ...conversation,
              ...definedPatch,
              tasks: Array.isArray(definedPatch.tasks) ? definedPatch.tasks : (Array.isArray(conversation.tasks) ? conversation.tasks : []),
              updatedAt: now,
            }
          : conversation
      )),
    };
  });
  return normalizeWorkspaceOrdering({
    ...state,
    projects,
    activeProjectId: nextActiveProjectId,
    activeConversationId: conversationId,
  });
}

function workspaceStateWithConversationRuntimeTask(state, conversationId, nextTask) {
  const taskKey = nextTask?.taskId || nextTask?.id;
  if (!conversationId || !taskKey) return state;
  const taskTimestamp = taskUpdatedTimestamp(nextTask) || Date.now();
  let updated = false;
  const projects = state.projects.map((project) => {
    let projectTouched = false;
    const conversations = project.conversations.map((conversation) => {
      if (conversation.id !== conversationId) return conversation;
      projectTouched = true;
      const tasks = Array.isArray(conversation.tasks) ? conversation.tasks : [];
      let found = false;
      const nextTasks = tasks.map((task) => {
        const currentKey = task?.taskId || task?.id;
        if (currentKey !== taskKey) return task;
        found = true;
        updated = true;
        return { ...task, ...nextTask };
      });
      if (!found) {
        updated = true;
        nextTasks.push(nextTask);
      }
      return {
        ...conversation,
        tasks: nextTasks,
        updatedAt: Math.max(timestampValue(conversation.updatedAt), taskTimestamp),
      };
    });
    return {
      ...project,
      updatedAt: projectTouched ? Math.max(timestampValue(project.updatedAt), taskTimestamp) : project.updatedAt,
      conversations,
    };
  });
  return updated ? normalizeWorkspaceOrdering({ ...state, projects }) : state;
}

function findProjectByConversationId(state, conversationId) {
  return state.projects.find((project) => (
    project.conversations.some((conversation) => conversation.id === conversationId)
  )) || null;
}

function findConversationById(state, conversationId) {
  for (const project of state.projects || []) {
    const conversation = (project.conversations || []).find((item) => item.id === conversationId);
    if (conversation) return conversation;
  }
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createConversationWithRetry(payload, isCurrentActivation) {
  let lastStatus = null;
  for (let attempt = 1; attempt <= CONVERSATION_BOOTSTRAP_MAX_ATTEMPTS; attempt += 1) {
    if (!isCurrentActivation()) return null;
    const response = await authFetch(`${API_BASE}/api/conversations`, {
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
    updatedAt: now,
    completedAt: task.completedAt || now,
    error: options.error ?? task.error ?? null,
    aborted: options.aborted ?? task.aborted ?? normalized === 'cancelled',
    presentationPending: false,
    sceneCatchup: false,
    serverFinished: true,
  };
}

function sortTaskIdsForRestore(tasks) {
  return tasks
    .map((task, index) => ({
      taskId: task.task_id,
      createdAt: taskCreatedTimestamp(task),
      index,
    }))
    .filter((item) => item.taskId)
    .sort((a, b) => {
      if (a.createdAt && b.createdAt && a.createdAt !== b.createdAt) {
        return a.createdAt - b.createdAt;
      }
      return a.index - b.index;
    })
    .map((item) => item.taskId);
}

function createPendingTaskDraft(text, attachment, imageAttachments) {
  const now = Date.now();
  const displayText = stripChatImageAugmentation(text).text || String(text || '').trim();
  return {
    id: generateHexId(),
    title: displayText,
    description: defaultQuestDescription(displayText),
    createdAt: now,
    updatedAt: now,
    stage: 'assigned',
    status: 'queued',
    assignedTo: 'guts',
    assignedToLabel: 'Assistant',
    requestedProvider: 'auto',
    attachment: attachment ? { ...attachment } : null,
    imageAttachments: Array.isArray(imageAttachments)
      ? imageAttachments.map((ref) => ({ ...ref }))
      : [],
    originViewMode: 'world',
  };
}

function buildWorldTaskRecord(event, pendingTask) {
  const pendingImages = Array.isArray(pendingTask?.imageAttachments)
    ? pendingTask.imageAttachments.map((ref) => ({ ...ref }))
    : [];
  const fallbackTitle = stripChatImageAugmentation(pendingTask?.title || event.message || '').text || 'Task';
  return {
    taskId: event.task_id,
    conversationId: event.conversation_id || null,
    title: fallbackTitle,
    description: pendingTask?.description || defaultQuestDescription(fallbackTitle),
    status: 'queued',
    stage: 'assigned',
    createdAt: pendingTask?.createdAt || Date.now(),
    updatedAt: pendingTask?.updatedAt || pendingTask?.createdAt || Date.now(),
    imageAttachments: pendingImages,
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

function taskSummaryToRuntimeTask(task, fallbackImageAttachments = [], ownerId = '') {
  const taskAttachments = Array.isArray(task.attachments)
    ? task.attachments.map((attachment) => ({ ...attachment, uploaded: true }))
    : [];
  const titleParts = stripChatImageAugmentation(task.title);
  const descriptionParts = stripChatImageAugmentation(task.description);
  const imageAttachments = normalizeChatImageRefs(
    mergeChatImageRefs(task.image_attachments || task.imageAttachments || [], fallbackImageAttachments, titleParts.imageRefs, descriptionParts.imageRefs),
    task.conversation_id,
    ownerId,
  );
  const title = titleParts.text || String(task.title || '').trim() || 'Task';
  return {
    taskId: task.task_id,
    conversationId: task.conversation_id,
    title,
    description: descriptionParts.text || defaultQuestDescription(title),
    status: task.status,
    stage: task.stage,
    createdAt: task.created_at ? Date.parse(task.created_at) || Date.now() : Date.now(),
    updatedAt: task.updated_at
      ? Date.parse(task.updated_at) || null
      : (task.completed_at ? Date.parse(task.completed_at) || null : null),
    completedAt: task.completed_at ? Date.parse(task.completed_at) || null : null,
    assignedTo: 'guts',
    assignedToLabel: 'Assistant',
    attachment: taskAttachments[0] || null,
    attachments: taskAttachments,
    imageAttachments,
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

function taskDetailToRuntimeTask(task, previousTask = null, ownerId = '') {
  const events = normalizeWorldEvents(task.events);
  const summaryTask = taskSummaryToRuntimeTask(task, previousTask?.imageAttachments || [], ownerId);
  const nextTask = {
    ...(previousTask || summaryTask),
    ...summaryTask,
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
    || eventType === 'context_compaction_started'
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
    updatedAt: taskUpdatedTimestamp(task) || task.createdAt,
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
  const eventData = event.data || event.payload?.data || event.payload || event;
  const message = String(event.message || '').trim();
  switch (event.type) {
    case 'user_message_received':
      return 'Task received.';
    case 'agent_gateway_received':
      return 'Preparing the agent route.';
    case 'provider_selected':
      return `Model selected: ${event.provider || event.provider_key || 'auto'}.`;
    case 'context_compaction_started':
      return 'Auto-Compacting context';
    case 'context_compaction_completed':
      return 'Auto-Compacting context';
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
    case 'sub_agent_started':
      return message || `${event.role || 'Sub-agent'} started.`;
    case 'sub_agent_finished':
      return event.outputSummary || message || `${event.role || 'Sub-agent'} finished.`;
    case 'sub_agent_progress_delta':
    case 'sub_agent_answer_delta':
      return message || event.delta || event.text || event.contentDelta || event.outputSummary || '';
    case 'sub_agent_tool_call_requested':
      return message || `${event.role || 'Sub-agent'} requested ${toolName}.`;
    case 'sub_agent_tool_executor_completed':
      return event.outputSummary || message || `${toolName} completed.`;
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
  const fallback = normalizeTaskStatus(fallbackStatus);
  if (normalized === 'returned' || normalized === 'completed' || normalized === 'done') return 'done';
  if (normalized === 'failed' || normalized === 'error') return 'failed';
  // In-flight states: when the surrounding task has already finished, the
  // call's "still running" marker cannot be true anymore — it just means the
  // matching tool_executor_completed / tool_result_returned event was never
  // recorded (or this timeline was rebuilt before those events were merged).
  // Defer to the terminal task status instead of rendering a permanent
  // yellow indicator. This is the safety net that catches the "switch away
  // and back → all tool calls yellow" regression even if the buildChatTimeline
  // event-pairing logic ever misses a callId.
  if (normalized === 'running' || normalized === 'dispatched' || normalized === 'received' || normalized === 'requested') {
    if (fallback === 'done') return 'done';
    if (fallback === 'failed') return 'failed';
    if (fallback === 'cancelled') return 'cancelled';
    return 'running';
  }
  if (fallback === 'done') return 'done';
  if (fallback === 'failed') return 'failed';
  return 'pending';
}

function getToolResponseTraceStatus(response, fallback = '') {
  if (!response || typeof response !== 'object') return fallback || '';
  const status = String(response.status || '').toLowerCase();
  const resultState = String(response.result_state || response.resultState || response.state || '').toLowerCase();
  const error = response.error || null;
  if (error || status === 'error' || status === 'failed' || resultState === 'blocked' || resultState === 'failed' || resultState === 'error') {
    return 'failed';
  }
  if (status === 'ok' || status === 'success' || resultState === 'resolved' || resultState === 'done' || resultState === 'success') {
    return 'done';
  }
  if (resultState === 'not_found' || resultState === 'no_change' || resultState === 'partial') {
    return 'done';
  }
  return fallback || '';
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
  'context_compaction_started',
  'context_compaction_completed',
  'context_usage_updated',
  'tool_budget_applied',
  'llm_thinking_started',
  'llm_thinking_completed',
]);

function formatMetaDetail(event) {
  const eventData = event.data || event.payload?.data || event.payload || event;
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
    case 'context_compaction_started': {
      return 'Auto-Compacting context';
    }
    case 'context_compaction_completed': {
      return 'Auto-Compacting context';
    }
    case 'context_usage_updated': {
      if (event.source === 'provider_usage' && event.context_used_tokens == null && event.usedTokens == null) return '';
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

// Known compound MCP server prefixes that contain underscores. Without this
// list a name like `chrome_devtools_navigate_page` would get bucketed under
// "chrome" instead of "chrome devtools". Single-token prefixes (`context7`,
// `sketch`, etc.) just fall through to the first-token fallback.
const KNOWN_MCP_COMPOUND_PREFIXES = ['chrome_devtools'];

function mcpServerNameFromToolName(toolName) {
  const s = String(toolName || '').toLowerCase().trim();
  if (!s) return 'mcp';
  // Strip dispatch control suffixes first (mcp_control_tool_name on the
  // backend: `<prefix>_call` / `<prefix>_list_tools` / `<prefix>_activate`).
  for (const suffix of ['_list_tools', '_activate', '_call']) {
    if (s.endsWith(suffix)) return s.slice(0, -suffix.length).replace(/_/g, ' ');
  }
  for (const prefix of KNOWN_MCP_COMPOUND_PREFIXES) {
    if (s === prefix || s.startsWith(`${prefix}_`)) return prefix.replace(/_/g, ' ');
  }
  // Default: server prefix is the first underscore-separated token.
  return s.split('_')[0] || 'mcp';
}

// Bucket each tool into a verb-based summary entry so a run of consecutive
// tools can be collapsed into "read 3 files · executed 2 commands · used
// chrome devtools 11 tools" without enumerating every chip. `verbPast` is
// shown after the group's run finishes (`status === 'done' / 'failed' /
// 'cancelled'`); `verbPresent` (present continuous) shows while at least one
// tool in the group is still in flight, so the chip reads "using chrome
// devtools 4 tools" → "used chrome devtools 4 tools" as it transitions.
function classifyToolForGroup(item) {
  const category = item?.category || 'tool';
  const name = String(item?.toolName || '').toLowerCase();
  const fileUnit = { unitSingular: 'file', unitPlural: 'files' };
  // 名字命中的专属规则优先于 category。某些工具（如 vision_analyze）后端
  // toolGroup="external"/category="mcp"，但语义上不该被并进 "used vision 1
  // tool"——它处理图像/视频，应该单独成 "visualized 1 image"。
  if (name === 'read_file' || name === 'list_dir' || name === 'cat_file'
      || name === 'view_file' || name === 'open_file' || name.includes('read_text')) {
    return { bucket: 'read', verbPast: 'read', verbPresent: 'reading', subject: '', ...fileUnit };
  }
  if (name === 'write_file' || name === 'create_file' || name === 'save_file') {
    return { bucket: 'wrote', verbPast: 'wrote', verbPresent: 'writing', subject: '', ...fileUnit };
  }
  if (name === 'edit_file' || name === 'apply_diff' || name.includes('patch')) {
    return { bucket: 'edited', verbPast: 'edited', verbPresent: 'editing', subject: '', ...fileUnit };
  }
  if (name === 'delete_file' || name === 'remove_file') {
    return { bucket: 'deleted', verbPast: 'deleted', verbPresent: 'deleting', subject: '', ...fileUnit };
  }
  if (name === 'copy_file' || name === 'move_file' || name === 'rename_file' || name === 'create_dir') {
    return { bucket: 'managed', verbPast: 'managed', verbPresent: 'managing', subject: '', ...fileUnit };
  }
  if (name === 'glob_files' || name === 'search_text' || name === 'grep'
      || (name.includes('search') && !name.includes('web'))) {
    return { bucket: 'searched', verbPast: 'searched', verbPresent: 'searching', subject: '', unitSingular: 'time', unitPlural: 'times' };
  }
  if (name === 'terminal' || name.includes('background_process')) {
    return { bucket: 'executed', verbPast: 'executed', verbPresent: 'executing', subject: '', unitSingular: 'command', unitPlural: 'commands' };
  }
  if (name === 'vision_analyze' || name === 'visual_inspect' || name === 'image_describe'
      || name === 'video_analyze' || name.startsWith('vision_') || name.startsWith('visual_')) {
    return { bucket: 'visualized', verbPast: 'visualized', verbPresent: 'visualizing', subject: '', unitSingular: 'image', unitPlural: 'images' };
  }
  if (name.includes('web') || name.includes('fetch') || name.includes('http') || name.endsWith('_url')) {
    return { bucket: 'fetched', verbPast: 'fetched', verbPresent: 'fetching', subject: '', unitSingular: 'page', unitPlural: 'pages' };
  }
  if (name.includes('memory') || name.includes('remember') || name.includes('recall') || name.startsWith('note_')) {
    return { bucket: 'noted', verbPast: 'recorded', verbPresent: 'recording', subject: '', unitSingular: 'note', unitPlural: 'notes' };
  }
  if (name.includes('checkpoint') || name.includes('rollback')) {
    return { bucket: 'snapshot', verbPast: 'snapshotted', verbPresent: 'snapshotting', subject: '', unitSingular: 'checkpoint', unitPlural: 'checkpoints' };
  }
  if (name.startsWith('document_') || name.includes('rag') || name.includes('knowledge')
      || name.includes('retrieve') || name.includes('vector') || name.includes('embed')) {
    return { bucket: 'queried', verbPast: 'queried', verbPresent: 'querying', subject: 'knowledge', unitSingular: 'time', unitPlural: 'times' };
  }
  // category 兜底：MCP 工具按 server 聚合。
  if (category === 'mcp') {
    const server = mcpServerNameFromToolName(name);
    return {
      bucket: `mcp:${server}`,
      verbPast: 'used',
      verbPresent: 'using',
      subject: server,
      unitSingular: 'tool',
      unitPlural: 'tools',
    };
  }
  return { bucket: 'other', verbPast: 'used', verbPresent: 'using', subject: '', unitSingular: 'tool', unitPlural: 'tools' };
}

function summarizeToolGroup(tools, status = 'done') {
  const buckets = new Map();
  for (const tool of tools) {
    const meta = classifyToolForGroup(tool);
    const prev = buckets.get(meta.bucket);
    if (prev) {
      prev.count += 1;
    } else {
      buckets.set(meta.bucket, { ...meta, count: 1 });
    }
  }
  // Any in-flight tool in the run → present continuous ("using" / "reading").
  // Otherwise → past tense ("used" / "read"). Keeps the chip reading naturally
  // as it transitions live.
  const inFlight = status === 'running' || status === 'pending';
  const renderEntry = (e) => {
    const unit = e.count === 1 ? e.unitSingular : e.unitPlural;
    const verb = inFlight ? e.verbPresent : e.verbPast;
    if (e.bucket && e.bucket.startsWith('mcp:')) {
      // "using chrome devtools 11 tools" / "used chrome devtools 11 tools"
      return `${verb} ${e.subject} ${e.count} ${unit}`.replace(/\s+/g, ' ').trim();
    }
    if (e.subject) {
      return `${verb} ${e.count} ${unit} ${e.subject}`.trim();
    }
    return `${verb} ${e.count} ${unit}`;
  };
  const orderedKeys = [
    'read', 'wrote', 'edited', 'deleted', 'managed',
    'searched', 'executed', 'fetched', 'visualized',
    'noted', 'snapshot', 'queried',
  ];
  const parts = [];
  for (const key of orderedKeys) {
    if (buckets.has(key)) parts.push(renderEntry(buckets.get(key)));
  }
  const mcpKeys = [...buckets.keys()].filter((k) => k.startsWith('mcp:')).sort();
  for (const k of mcpKeys) parts.push(renderEntry(buckets.get(k)));
  if (buckets.has('other')) parts.push(renderEntry(buckets.get('other')));
  // Cap visible bucket entries at 3; overflow collapses into "+N more" so the
  // chip stays single-line. Full breakdown is still reachable via the tooltip
  // attribute on the head + the click-to-expand list below.
  const MAX_VISIBLE = 3;
  if (parts.length > MAX_VISIBLE) {
    const visible = parts.slice(0, MAX_VISIBLE);
    const hidden = parts.length - MAX_VISIBLE;
    return {
      short: `${visible.join(' · ')} · +${hidden} more`,
      full: parts.join(' · '),
    };
  }
  const joined = parts.join(' · ');
  return { short: joined, full: joined };
}

function aggregateGroupStatus(tools) {
  let anyRunning = false;
  let anyFailed = false;
  let anyPending = false;
  for (const t of tools) {
    const s = String(t?.status || '').toLowerCase();
    if (s === 'running') anyRunning = true;
    else if (s === 'failed') anyFailed = true;
    else if (s === 'pending') anyPending = true;
  }
  if (anyRunning) return 'running';
  if (anyFailed) return 'failed';
  if (anyPending) return 'pending';
  return 'done';
}

// Walk a built timeline and collapse runs of consecutive tool chips (≥ 2) into
// a single `tool_group` item. Skills and sub-agents are left untouched —
// skills carry nested children that need their own affordance, sub-agents
// are distinct narrative moments.
function groupConsecutiveTools(items) {
  const result = [];
  const isGroupable = (it) => (
    it && it.kind === 'tool'
    && it.category !== 'skill'
    && it.category !== 'subagent'
  );
  let groupIdx = 0;
  let i = 0;
  while (i < items.length) {
    if (!isGroupable(items[i])) {
      result.push(items[i]);
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < items.length && isGroupable(items[j])) j += 1;
    const run = items.slice(i, j);
    if (run.length >= 2) {
      const groupStatus = aggregateGroupStatus(run);
      const summary = summarizeToolGroup(run, groupStatus);
      result.push({
        kind: 'tool_group',
        id: `tool-group-${groupIdx}`,
        summary: summary.short,
        summaryFull: summary.full,
        tools: run,
        status: groupStatus,
      });
      groupIdx += 1;
    } else {
      result.push(run[0]);
    }
    i = j;
  }
  return result;
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

function toolProgressSummary(event) {
  const toolName = chatTraceToolName(event.toolName);
  const message = String(event.message || '').trim();
  switch (event.type) {
    case 'llm_tool_call_requested':
      return event.inputSummary || message || `${toolName} requested.`;
    case 'tool_manager_received':
      return message || 'Tool Manager accepted the request.';
    case 'tool_dispatched':
      return message || `Dispatched to ${event.executorRole || event.target || 'executor'}.`;
    case 'tool_executor_started':
      return message || `${toolName} started.`;
    case 'tool_executor_completed':
      return event.outputSummary || message || `${toolName} completed.`;
    case 'tool_result_returned':
      return event.outputSummary || message || `${toolName} returned results.`;
    case 'tool_executor_failed':
    case 'tool_executor_error':
      return message || `${toolName} failed.`;
    case 'sub_agent_started':
      return message || `${event.role || 'Sub-agent'} started.`;
    case 'sub_agent_finished':
      return event.outputSummary || message || `${event.role || 'Sub-agent'} finished.`;
    case 'sub_agent_progress_delta':
    case 'sub_agent_answer_delta':
      return message || event.delta || event.text || event.contentDelta || event.outputSummary || '';
    case 'sub_agent_tool_call_requested':
      return message || `${event.role || 'Sub-agent'} requested ${toolName}.`;
    case 'sub_agent_tool_executor_completed':
      return event.outputSummary || message || `${toolName} completed.`;
    default:
      return message || event.inputSummary || event.outputSummary || '';
  }
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
  let currentCompactionItem = null;
  const seenToolIds = new Set();
  // Track per-callId tool item so completion / failure events can update the
  // existing entry in place. Without this the entry is created at
  // llm_tool_call_requested time with status="running" and is NEVER updated,
  // which is what caused the "all tool calls yellow" regression after a
  // tab-switch round-trip rebuilds the timeline from the event log alone.
  const toolItemsByCallId = new Map();
  const canNestToolChildren = (toolItem) => {
    if (!toolItem) return false;
    const status = String(toolItem.status || '').toLowerCase();
    return status === 'pending' || status === 'running';
  };
  const appendToolProgress = (toolItem, event, state = '') => {
    if (!toolItem || !event) return;
    const summary = toolProgressSummary(event);
    if (!summary) return;
    const progressEvents = Array.isArray(toolItem.progressEvents)
      ? toolItem.progressEvents
      : [];
    const last = progressEvents[progressEvents.length - 1];
    if (last && last.type === event.type && last.summary === summary) return;
    progressEvents.push({
      id: `${toolItem.id}-${event.type}-${progressEvents.length}`,
      type: event.type,
      state,
      callId: event.callId || event.toolCallId || event.tool_call_id || '',
      parentCallId: event.parentCallId || event.parent_call_id || '',
      role: event.role || event.subAgentRole || event.sub_agent_role || '',
      toolName: event.toolName || event.tool_name || '',
      toolInput: event.toolInput || event.tool_input || null,
      toolResponse: event.toolResponse || event.tool_response || null,
      toolOutput: event.toolOutput || event.tool_output || '',
      summary,
      message: event.message || '',
      inputSummary: event.inputSummary || '',
      outputSummary: event.outputSummary || '',
      timestamp: event.timestamp || null,
    });
    toolItem.progressEvents = progressEvents;
  };
  const appendToolProgressByEvent = (event, state = '') => {
    const callId = event?.callId || '';
    if (!callId) return;
    const toolItem = toolItemsByCallId.get(callId);
    if (!toolItem) return;
    appendToolProgress(toolItem, event, state);
  };
  const appendSubAgentProgressByEvent = (event, state = '') => {
    const parentCallId = event?.parentCallId || event?.parent_call_id || '';
    if (!parentCallId) return;
    const toolItem = toolItemsByCallId.get(parentCallId);
    if (!toolItem) return;
    if (event?.type === 'sub_agent_answer_delta') {
      const progressEvents = Array.isArray(toolItem.progressEvents)
        ? toolItem.progressEvents
        : [];
      const summary = toolProgressSummary(event);
      if (!summary) return;
      const last = progressEvents[progressEvents.length - 1];
      if (last && last.type === event.type) {
        last.summary = appendAnswerDelta(last.summary, summary);
        last.message = appendAnswerDelta(last.message, event.message || summary);
        last.toolOutput = appendAnswerDelta(last.toolOutput, event.toolOutput || event.tool_output || '');
        last.timestamp = event.timestamp || last.timestamp || null;
        toolItem.progressEvents = progressEvents;
        return;
      }
    }
    appendToolProgress(toolItem, event, state);
  };
  const subAgentProgressState = (type) => {
    if (type === 'sub_agent_answer_delta') return 'stream';
    if (type === 'sub_agent_started') return 'running';
    if (type === 'sub_agent_finished') return 'completed';
    if (type === 'sub_agent_tool_call_requested') return 'requested';
    if (type === 'sub_agent_tool_executor_completed') return 'completed';
    return 'progress';
  };
  const finalizeToolItem = (callId, terminalState, event = null) => {
    if (!callId) return;
    const toolItem = toolItemsByCallId.get(callId);
    if (!toolItem) return;
    const responseState = getToolResponseTraceStatus(event?.toolResponse, terminalState);
    toolItem.status = getToolTraceStatus(responseState || terminalState, finalStatus);
    if (toolItem === currentSkillItem && !canNestToolChildren(toolItem)) {
      currentSkillItem = null;
    }
    if (!event) return;
    toolItem.outputSummary = event.outputSummary || toolItem.outputSummary || '';
    toolItem.toolResponse = event.toolResponse || toolItem.toolResponse || null;
    toolItem.toolOutput = event.toolOutput || toolItem.toolOutput || '';
    appendToolProgress(toolItem, event, terminalState);
  };

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
      continue;
    }
    if (type === 'context_compaction_started' || type === 'context_compaction_completed') {
      flushThinking(false);
      if (textBuf.trim()) flushText();
      if (type === 'context_compaction_completed') {
        if (currentCompactionItem) {
          currentCompactionItem.status = 'done';
        } else {
          items.push({
            kind: 'meta',
            id: event.event_id || `meta-${items.length}`,
            summary: 'Auto-Compacting context',
            details: [],
            status: 'done',
          });
        }
        currentCompactionItem = null;
      } else {
        currentCompactionItem = {
          kind: 'meta',
          id: event.event_id || `meta-${items.length}`,
          summary: 'Auto-Compacting context',
          details: [],
          status: 'running',
        };
        items.push(currentCompactionItem);
      }
      currentSkillItem = null;
      continue;
    }
    if (type === 'llm_answer_delta') {
      flushThinking(false);
      textBuf += event.message || '';
      continue;
    }
    if (type === 'agent_progress_delta') {
      flushThinking(false);
      if (textBuf.trim()) flushText();
      textBuf += event.message || '';
      flushText();
      continue;
    }
    if (
      type === 'sub_agent_progress_delta'
      || type === 'sub_agent_answer_delta'
      || type === 'sub_agent_tool_call_requested'
      || type === 'sub_agent_tool_executor_completed'
      || type === 'sub_agent_started'
      || type === 'sub_agent_finished'
    ) {
      appendSubAgentProgressByEvent(
        event,
        subAgentProgressState(type),
      );
      continue;
    }
    if (type === 'llm_tool_call_requested') {
      flushThinking(false);
      if (textBuf.trim()) flushText();
      const callId = event.callId || '';
      if (callId && seenToolIds.has(callId)) {
        const existing = toolItemsByCallId.get(callId);
        if (existing) {
          existing.inputSummary = event.inputSummary || existing.inputSummary || '';
          existing.outputSummary = event.outputSummary || existing.outputSummary || '';
          existing.toolInput = event.toolInput || existing.toolInput || null;
          existing.toolResponse = event.toolResponse || existing.toolResponse || null;
          existing.toolOutput = event.toolOutput || existing.toolOutput || '';
          existing.message = event.message || existing.message || '';
          appendToolProgress(existing, event, 'requested');
        }
        continue;
      }
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
        toolInput: event.toolInput || null,
        toolResponse: event.toolResponse || null,
        toolOutput: event.toolOutput || '',
        message: event.message || '',
        state: 'requested',
      };
      const category = categorizeToolCall(call);
      const label = timelineToolLabel(call, category);
      const toolItem = {
        kind: 'tool',
        id: callId || `tool-${seenToolIds.size}`,
        callId,
        category,
        label,
        toolName: call.toolName || '',
        inputSummary: call.inputSummary || '',
        outputSummary: call.outputSummary || '',
        toolInput: call.toolInput || null,
        toolResponse: call.toolResponse || null,
        toolOutput: call.toolOutput || '',
        message: call.message || '',
        executor: call.executorRole || call.executorActorId || call.toolGroup || '',
        status: getToolTraceStatus(call.state, finalStatus),
        children: [],
        progressEvents: [],
      };
      appendToolProgress(toolItem, event, 'requested');
      if (callId) {
        seenToolIds.add(callId);
        toolItemsByCallId.set(callId, toolItem);
      }
      if (category === 'skill') {
        items.push(toolItem);
        currentSkillItem = canNestToolChildren(toolItem) ? toolItem : null;
      } else if (canNestToolChildren(currentSkillItem)) {
        currentSkillItem.children.push(toolItem);
      } else {
        items.push(toolItem);
      }
      continue;
    }
    if (type === 'tool_manager_received' || type === 'tool_dispatched' || type === 'tool_executor_started') {
      appendToolProgressByEvent(
        event,
        type === 'tool_executor_started'
          ? 'running'
          : type === 'tool_dispatched'
            ? 'dispatched'
            : 'received',
      );
      continue;
    }
    if (type === 'tool_executor_completed' || type === 'tool_result_returned') {
      // Tool finished cleanly: flip the existing tool item to done. We do not
      // touch text / thinking buffers because these completion events
      // intentionally come after the tool's matching request event.
      finalizeToolItem(event.callId || '', 'completed', event);
      continue;
    }
    if (type === 'tool_executor_failed' || type === 'tool_executor_error') {
      finalizeToolItem(event.callId || '', 'failed');
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
      toolInput: call.toolInput || null,
      toolResponse: call.toolResponse || null,
      toolOutput: call.toolOutput || '',
      message: call.message || '',
      executor: call.executorRole || call.executorActorId || call.toolGroup || '',
      status: getToolTraceStatus(call.state, finalStatus),
      children: [],
      progressEvents: [],
    };
    seenToolIds.add(call.callId);
    if (category === 'skill') {
      items.push(toolItem);
      currentSkillItem = canNestToolChildren(toolItem) ? toolItem : null;
    } else if (canNestToolChildren(currentSkillItem)) {
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

  // todo_write 不进时间线渲染——它是"持续更新的计划面板"，挂在活动指示器下方，
  // 由 latestTodos 单独承载。这里把所有 todo_write 抽出来取最后一次写入作为
  // 当前快照，其它工具不受影响。
  const displayItems = [];
  let latestTodos = null;
  for (const it of items) {
    if (it && it.kind === 'tool' && normalizeToolName(it.toolName) === 'todo_write') {
      const todos = extractTodosFromToolItem(it);
      if (todos) latestTodos = todos;
      continue;
    }
    displayItems.push(it);
  }

  // 折叠"两段文本之间"的连续工具调用为单行聚合 chip。聊天阅读时关心解决思路
  // (text + thinking)，不关心 read_file / chrome_devtools_* 反复的细节；想看
  // 单条工具调用时点开 chip 还能看到原来的 ChatTimelineToolNode 列表。
  return { items: groupConsecutiveTools(displayItems), latestTodos };
}

function extractTodosFromToolItem(item) {
  const response = item && item.toolResponse && typeof item.toolResponse === 'object'
    ? item.toolResponse
    : {};
  const artifacts = response.artifacts && typeof response.artifacts === 'object'
    ? response.artifacts
    : {};
  const rawTodos = Array.isArray(artifacts.todos) ? artifacts.todos : null;
  if (!rawTodos) return null;
  const sanitized = rawTodos
    .map((entry) => {
      const obj = entry && typeof entry === 'object' ? entry : {};
      const content = String(obj.content || '').trim();
      if (!content) return null;
      const statusRaw = String(obj.status || 'pending');
      const status = ['pending', 'in_progress', 'completed'].includes(statusRaw)
        ? statusRaw
        : 'pending';
      const activeForm = obj.activeForm ? String(obj.activeForm) : '';
      return { content, status, activeForm };
    })
    .filter(Boolean);
  return sanitized.length > 0 ? sanitized : null;
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
    updatedAt: pendingTask.updatedAt || pendingTask.createdAt,
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

function AuthScreen({ mode, onModeChange, onSubmit, submitting = false, error = '', errorKey = 0 }) {
  const [account, setAccount] = useState('');
  const [userName, setUserName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [localError, setLocalError] = useState('');
  const [localErrorKey, setLocalErrorKey] = useState(0);
  const [authToast, setAuthToast] = useState(null);
  const [touchedFields, setTouchedFields] = useState({
    userName: false,
    password: false,
  });
  const isRegister = mode === 'register';
  const primaryLabel = isRegister ? 'Create account' : 'Sign in';
  const secondaryLabel = isRegister ? 'Sign in' : 'Create account';

  const clearLocalValidation = () => {
    setLocalError('');
    setAuthToast(null);
  };

  const markFieldTouched = (field) => {
    setTouchedFields((current) => ({ ...current, [field]: true }));
  };

  const userNameError = isRegister && touchedFields.userName && userName.trim() && userName.trim().length < 3
    ? 'User name must be at least 3 characters.'
    : '';
  const passwordError = isRegister && touchedFields.password && password && password.length < 8
    ? 'Password must be at least 8 characters.'
    : '';

  const renderPasswordToggle = (visible, onToggle, label) => (
    <button
      type="button"
      className="auth-password-toggle"
      onClick={onToggle}
      aria-label={visible ? `Hide ${label}` : `Show ${label}`}
      aria-pressed={visible}
      disabled={submitting}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {visible ? (
          <>
            <path d="M3 3l18 18" />
            <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
            <path d="M9.9 4.4A10.7 10.7 0 0 1 12 4c6.5 0 10 8 10 8a18.7 18.7 0 0 1-3.1 4.4" />
            <path d="M6.5 6.5C3.6 8.5 2 12 2 12s3.5 8 10 8a10.7 10.7 0 0 0 4.3-.9" />
          </>
        ) : (
          <>
            <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
            <circle cx="12" cy="12" r="3" />
          </>
        )}
      </svg>
    </button>
  );

  useEffect(() => {
    const message = localError || error;
    if (!message) {
      setAuthToast(null);
      return undefined;
    }
    const nextToast = {
      id: `${errorKey}-${localErrorKey}-${Date.now()}`,
      message,
    };
    setAuthToast(nextToast);
    const timer = setTimeout(() => {
      setAuthToast((current) => (current?.id === nextToast.id ? null : current));
    }, 3200);
    return () => clearTimeout(timer);
  }, [localError, error, errorKey, localErrorKey]);

  const submit = (event) => {
    event.preventDefault();
    clearLocalValidation();
    if (isRegister) {
      const missingRegisterFields = {
        userName: !userName.trim(),
        email: !email.trim(),
        password: !password,
        confirmPassword: !confirmPassword,
        terms: !agreedToTerms,
      };
      if (Object.values(missingRegisterFields).some(Boolean)) {
        setLocalError('Please complete all required fields.');
        setLocalErrorKey((current) => current + 1);
        return;
      }
      const nextUserNameError = userName.trim().length < 3;
      const nextPasswordError = password.length < 8;
      if (nextUserNameError || nextPasswordError) {
        setTouchedFields((current) => ({
          ...current,
          userName: true,
          password: true,
        }));
        setLocalError('Please fix the highlighted fields.');
        setLocalErrorKey((current) => current + 1);
        return;
      }
      if (password !== confirmPassword) {
        setLocalError("Passwords don't match.");
        setLocalErrorKey((current) => current + 1);
        return;
      }
      onSubmit({
        mode,
        userName: userName.trim(),
        email: email.trim(),
        password,
      });
    } else {
      const missingLoginFields = {
        account: !account.trim(),
        password: !password,
      };
      if (missingLoginFields.account || missingLoginFields.password) {
        const message = missingLoginFields.account && missingLoginFields.password
          ? 'Enter your account and password to sign in.'
          : missingLoginFields.account
            ? 'Enter your account or email to sign in.'
            : 'Enter your password to sign in.';
        setLocalError(message);
        setLocalErrorKey((current) => current + 1);
        return;
      }
      onSubmit({
        mode,
        account: account.trim(),
        password,
        remember,
      });
    }
  };

  const displayError = authToast?.message || '';

  return (
    <div className={`auth-shell auth-shell-${mode}`}>
      <div className="app-topbar auth-topbar" aria-hidden="true">
        <div className="topbar-brand">
          <div className="topbar-logo" />
          <div className="topbar-title">Haish Agent</div>
        </div>
      </div>
      <div className="auth-hero">
        <div className="auth-hero-copy">
          <span>Your AI work assistant</span>
          <h1>The More It Works,<br />the Smarter It Gets.</h1>
          <p>Your agent learns from every interaction and continuously improves for you.</p>
        </div>
        <img className="auth-hero-image" src="assets/auth/login-hero.png?v=2" alt="" aria-hidden="true" draggable={false} />
      </div>

      <section className={displayError ? 'auth-card auth-card--shake' : 'auth-card'} key={displayError ? `auth-card-${errorKey}-${localErrorKey}-${displayError}` : 'auth-card'} aria-label="Account authentication">
        <div className="auth-card-head">
          <h2>{isRegister ? 'Create account' : 'Welcome back'}</h2>
          <p>{isRegister ? 'Set up your account and get started.' : 'Sign in to continue to your workspace.'}</p>
        </div>
        {isRegister ? null : (
          <div className="auth-tabs" role="tablist" aria-label="Sign in method">
            <button type="button" className="active" role="tab" aria-selected="true">Account login</button>
          </div>
        )}

        <form className="auth-form" onSubmit={submit} noValidate>
          {isRegister ? (
            <>
              <label className={`auth-field auth-field--user${userNameError ? ' auth-field--invalid' : ''}`}>
                <span>User name</span>
                <input
                  value={userName}
                  onChange={(event) => {
                    setUserName(event.target.value);
                    clearLocalValidation();
                  }}
                  onBlur={() => markFieldTouched('userName')}
                  aria-invalid={Boolean(userNameError)}
                  aria-describedby={userNameError ? 'auth-user-name-error' : undefined}
                  placeholder="Enter your user name"
                  autoComplete="username"
                  disabled={submitting}
                  required
                />
                {userNameError ? <span className="auth-field-error" id="auth-user-name-error">{userNameError}</span> : null}
              </label>

              <label className="auth-field auth-field--mail">
                <span>Email</span>
                <input
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    clearLocalValidation();
                  }}
                  placeholder="name@company.com"
                  type="email"
                  autoComplete="email"
                  disabled={submitting}
                  required
                />
              </label>

              <label className={`auth-field auth-field--lock${passwordError ? ' auth-field--invalid' : ''}`}>
                <span>Password</span>
                <input
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    clearLocalValidation();
                  }}
                  onBlur={() => markFieldTouched('password')}
                  aria-invalid={Boolean(passwordError)}
                  aria-describedby={passwordError ? 'auth-password-error' : undefined}
                  placeholder="Enter your password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  minLength={8}
                  disabled={submitting}
                  required
                />
                {renderPasswordToggle(showPassword, () => setShowPassword((current) => !current), 'password')}
                {passwordError ? <span className="auth-field-error" id="auth-password-error">{passwordError}</span> : null}
              </label>

              <label className="auth-field auth-field--lock">
                <span>Confirm password</span>
                <input
                  value={confirmPassword}
                  onChange={(event) => {
                    setConfirmPassword(event.target.value);
                    clearLocalValidation();
                  }}
                  placeholder="Confirm your password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  minLength={8}
                  disabled={submitting}
                  required
                />
                {renderPasswordToggle(showConfirmPassword, () => setShowConfirmPassword((current) => !current), 'confirm password')}
              </label>

              <label className="auth-terms">
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(event) => {
                    setAgreedToTerms(event.target.checked);
                    clearLocalValidation();
                  }}
                  disabled={submitting}
                  required
                />
                <span>
                  I agree to the <a href="#" onClick={(e) => e.preventDefault()}>Terms</a> and <a href="#" onClick={(e) => e.preventDefault()}>Privacy Policy</a>
                </span>
              </label>
            </>
          ) : (
            <>
              <label className="auth-field auth-field--mail">
                <span>Account / Email</span>
                <input
                  value={account}
                  onChange={(event) => {
                    setAccount(event.target.value);
                    clearLocalValidation();
                  }}
                  placeholder="name@company.com"
                  autoComplete="username"
                  disabled={submitting}
                  required
                />
              </label>

              <label className="auth-field auth-field--lock">
                <span>Password</span>
                <input
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    clearLocalValidation();
                  }}
                  placeholder="Enter password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  minLength={1}
                  disabled={submitting}
                  required
                />
                {renderPasswordToggle(showPassword, () => setShowPassword((current) => !current), 'password')}
              </label>

              <div className="auth-row">
                <label className="auth-remember">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(event) => setRemember(event.target.checked)}
                    disabled={submitting}
                  />
                  <span>Remember me</span>
                </label>
                <button type="button" className="auth-link" disabled>Forgot password?</button>
              </div>
            </>
          )}

          <button type="submit" className="auth-primary" disabled={submitting}>
            {submitting ? (
              <>
                <span>{isRegister ? 'Creating account...' : 'Signing in...'}</span>
                <span className="auth-loading-icon" aria-hidden="true" />
              </>
            ) : primaryLabel}
          </button>

          <div className="auth-mode-switch">
            <span>{isRegister ? 'Already have an account?' : "Don't have an account?"}</span>
            <button
              type="button"
              onClick={() => onModeChange(isRegister ? 'login' : 'register')}
              disabled={submitting}
            >
              {secondaryLabel}
            </button>
          </div>
        </form>

        <div className="auth-divider"><span>Or continue with</span></div>
        <div className="auth-socials">
          <button type="button" disabled>
            <svg className="auth-social-icon auth-social-github" viewBox="0 0 98 96" aria-hidden="true">
              <path fill="currentColor" fillRule="evenodd" clipRule="evenodd" d="M48.85 0C21.88 0 0 22.28 0 49.76c0 21.98 14 40.62 33.43 47.2 2.44.45 3.34-1.08 3.34-2.39 0-1.18-.04-4.3-.07-8.44-13.6 3.01-16.47-6.68-16.47-6.68-2.22-5.75-5.43-7.28-5.43-7.28-4.44-3.09.34-3.03.34-3.03 4.9.35 7.49 5.13 7.49 5.13 4.36 7.61 11.43 5.41 14.21 4.14.44-3.22 1.7-5.41 3.1-6.65-10.86-1.26-22.28-5.53-22.28-24.62 0-5.44 1.91-9.88 5.03-13.36-.5-1.26-2.18-6.33.48-13.18 0 0 4.1-1.34 13.43 5.1a45.74 45.74 0 0 1 24.46 0c9.33-6.44 13.42-5.1 13.42-5.1 2.67 6.85.99 11.92.49 13.18 3.13 3.48 5.02 7.92 5.02 13.36 0 19.14-11.44 23.35-22.34 24.58 1.75 1.54 3.32 4.58 3.32 9.24 0 6.66-.06 12.04-.06 13.67 0 1.32.88 2.87 3.36 2.38C84 90.36 98 71.73 98 49.76 98 22.28 76.13 0 48.85 0Z" />
            </svg>
            <span>GitHub</span>
          </button>
          <button type="button" disabled>
            <svg className="auth-social-icon auth-social-google" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.52h11.84a10.12 10.12 0 0 1-4.4 6.64v5.52h7.12c4.16-3.84 6.56-9.48 6.56-16.18Z" />
              <path fill="#34A853" d="M24 46c5.94 0 10.92-1.96 14.56-5.32l-7.12-5.52c-1.98 1.32-4.5 2.1-7.44 2.1-5.72 0-10.56-3.86-12.3-9.04H4.34v5.7A22 22 0 0 0 24 46Z" />
              <path fill="#FBBC05" d="M11.7 28.22A13.2 13.2 0 0 1 11 24c0-1.46.25-2.88.7-4.22v-5.7H4.34A22 22 0 0 0 2 24c0 3.55.85 6.9 2.34 9.92l7.36-5.7Z" />
              <path fill="#EA4335" d="M24 10.74c3.23 0 6.12 1.11 8.4 3.28l6.32-6.32C34.9 4.15 29.92 2 24 2A22 22 0 0 0 4.34 14.08l7.36 5.7c1.74-5.18 6.58-9.04 12.3-9.04Z" />
            </svg>
            <span>Google</span>
          </button>
        </div>
      </section>

      {authToast ? (
        <div className="auth-toast auth-toast-error" role="alert" aria-live="assertive" key={authToast.id}>
          <span className="auth-toast-icon" aria-hidden="true" />
          <span className="auth-toast-message">{authToast.message}</span>
        </div>
      ) : null}
    </div>
  );
}

function AuthGate() {
  const [session, setSession] = useState(authMemorySession);
  const [mode, setMode] = useState('login');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [errorKey, setErrorKey] = useState(0);
  const [postAuthToast, setPostAuthToast] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const markSignedOut = (message = '') => {
      if (cancelled) return;
      setSession(null);
      if (message) setError(message);
    };
    const handleExpired = () => markSignedOut('Session expired. Sign in again.');

    window.addEventListener('haish-auth-expired', handleExpired);
    (async () => {
      if (!authMemorySession?.accessToken && !authMemorySession?.refreshToken) {
        markSignedOut();
        return;
      }
      try {
        const user = await fetchCurrentAuthUser();
        if (cancelled) return;
        setSession({ ...authMemorySession, user });
        setError('');
      } catch (authError) {
        clearAuthSession({ notify: false });
        markSignedOut('Please sign in to continue.');
      }
    })();

    return () => {
      cancelled = true;
      window.removeEventListener('haish-auth-expired', handleExpired);
    };
  }, []);

  const handleSubmit = async (formData) => {
    setSubmitting(true);
    setError('');
    try {
      let nextSession;
      if (formData.mode === 'register') {
        nextSession = await registerNewAccount({
          userName: formData.userName,
          email: formData.email,
          password: formData.password,
        }, true);
      } else {
        nextSession = await loginWithPassword(formData.account, formData.password, formData.remember);
        setPostAuthToast({
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          kind: 'success',
          message: 'Login successful',
        });
      }
      setSession(nextSession);
      setMode('login');
    } catch (authError) {
      setError(formData.mode === 'login' ? 'Incorrect account or password. Try again.' : String(authError?.message || authError));
      setErrorKey((current) => current + 1);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await logoutCurrentSession();
    setSession(null);
    setMode('login');
    setError('');
  };

  if (!session?.accessToken) {
    return (
      <AuthScreen
        mode={mode}
        onModeChange={(nextMode) => {
          setMode(nextMode);
          setError('');
        }}
        onSubmit={handleSubmit}
        submitting={submitting}
        error={error}
        errorKey={errorKey}
      />
    );
  }
  return <App authUser={session.user} onLogout={handleLogout} initialToast={postAuthToast} />;
}

function App({ authUser = null, onLogout = () => undefined, initialToast = null }) {
  const [worldTaskState, setWorldTaskState] = useState(() => createEmptyWorldTaskState());
  const [workspaceState, setWorkspaceState] = useState(() => loadStoredWorkspaceState());
  const [activeTab, setActiveTab] = useState('dashboard');
  const [viewMode, setViewMode] = useState('chat');
  const viewModeRef = useRef('chat');
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
  const [modelCatalog, setModelCatalog] = useState(() => ({ options: [], defaultModelId: '' }));
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
  const activeRunIdRef = useRef(null);
  const conversationIdRef = useRef(null);
  const cancelledRunIdsRef = useRef(new Set());
  const fetchAbortRef = useRef(null);
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

  function createEmptyRuntime() {
    return {
      worldTaskState: createEmptyWorldTaskState(),
      busy: false,
      activeRunId: null,
      activeTaskId: null,
      fetchController: null,
      answerBuffer: '',
      cancelledRunIds: new Set(),
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

  async function activateConversationDetail(detail, { restoreLatest = true } = {}) {
    if (!detail?.conversation_id) return;
    // Race model (matches f2ee298 baseline): every activate bumps the
    // activation seq; any awaited work that resumes after a newer activation
    // started will see its seq invalidated and bail. handleSelect{Conversation,
    // Project,...} also use the same seq for fetch-stage cancellation.
    const activationSeq = invalidateConversationActivation();
    const isCurrentActivation = () => isConversationActivationCurrent(activationSeq);
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
      incomingRuntime && (incomingRuntime.busy || incomingRuntime.activeRunId || incomingRuntime.fetchController)
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

  async function fetchConversationDetail(nextConversationId) {
    const detailResponse = await authFetch(`${API_BASE}/api/conversations/${nextConversationId}`, {
      method: 'GET',
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
    if (event.type === 'llm_thinking_delta') return;
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

  async function playWorldEventScene(event, taskId, targetConvId = null) {
    if (!taskId) return;
    const run = getTaskById(taskId, targetConvId);
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
        pushBurst(npcStatesRef.current.gojo?.pos || window.STATIONS.gojo, window.KIND_COLORS?.llm || '#efbf64');
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

  async function uploadAttachment(file, signal, targetConversationId = conversationId) {
    if (!file || !targetConversationId) return null;
    const formData = new FormData();
    formData.append('conversation_id', targetConversationId);
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

  async function handleAttachmentSelect(file) {
    const targetConversationId = conversationIdRef.current || conversationId;
    if (!file || !targetConversationId) return;
    const uploadController = new AbortController();
    setRuntimeFetchController(uploadController, targetConversationId);
    setComposerAttachment({
      name: file.name,
      size: file.size,
      type: file.type,
      uploaded: false,
    });
    setUploadState({ active: true, fileName: file.name });
    try {
      const payload = await uploadAttachment(file, uploadController.signal, targetConversationId);
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
      if (conversationIdRef.current === targetConversationId && !(abortRef.current || error?.name === 'AbortError')) {
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
    if (event.type === 'llm_thinking_delta') {
      return;
    }
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
          compressed: event.compressed,
          compressedCount: event.compressed_count,
          updatedAt: event.created_at || event.timestamp || new Date().toISOString(),
        }, usageConversationId);
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
          event.delta || event.text || event.content_delta || ''
        ));
        updateTaskById(taskId, (run) => ({
          ...run,
          answerText: readRuntimeAnswerBuffer(),
          chatStreamText: run.chatStreamText,
          loopIndex,
        }));
        break;
      }
      case 'llm_final_answer': {
        setRuntimeAnswerBuffer(event.content || readRuntimeAnswerBuffer());
        if (isChatOriginTask(taskId)) {
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
        if (isChatOriginTask(taskId)) {
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
            imageAttachments: persistedImages.length > 0 ? persistedImages : run.imageAttachments,
            answerText: chatFinalizedTaskIdsRef.current.has(taskId) && run.answerText
              ? run.answerText
              : (persistedTask?.answer_text || (terminalStatus === 'done' ? (toDisplayText(event.message) || run.answerText) : run.answerText)),
            error: terminalError,
            serverFinished: true,
            sceneCatchup: hasPresentationPending,
          };
        });
        if (shouldWaitForPresentation && !isChatOriginTask(taskId)) {
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

    if (WORLD_SCENE_EVENT_TYPES.has(event.type) && !isChatOriginTask(taskId)) {
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
    });
    abortRef.current = false;
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
        const payload = await uploadAttachment(pendingTask.attachment.file, uploadController.signal, runConversationId);
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
        if (!(abortRef.current || error?.name === 'AbortError')) {
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
          provider: pendingTask.requestedProvider || 'auto',
          model_id: pendingTask.requestedModelId || null,
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
            || abortRef.current
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
    }
  }

  function handleStop() {
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
      const candidates = Object.values(tasksById).filter((task) => {
        const status = String(task?.status || '').toLowerCase();
        if (status !== 'running' && status !== 'queued') return false;
        if (task?.completedAt) return false;
        const answer = task?.answerText;
        if (typeof answer === 'string' && answer.trim().length > 0) return false;
        return true;
      });
      candidates.sort((a, b) => taskUpdatedTimestamp(b) - taskUpdatedTimestamp(a));
      const fallback = candidates[0];
      if (fallback?.taskId) taskId = fallback.taskId;
    }
    const runId = targetRuntime ? targetRuntime.activeRunId : activeRunIdRef.current;
    const controllerToAbort = targetRuntime ? targetRuntime.fetchController : fetchAbortRef.current;
    const runtimeBusy = targetRuntime ? targetRuntime.busy : busy;
    const hasActiveRun = runtimeBusy || taskId || currentTaskState.pendingTask || controllerToAbort;
    if (!hasActiveRun) return;
    abortRef.current = true;
    if (runId && targetRuntime) targetRuntime.cancelledRunIds.add(runId);
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

  function handleDeploy(text, attachment, modelId, reasoningEffort, imageAttachments) {
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
    const deployConvId = conversationIdRef.current || conversationId;
    if (!deployConvId) {
      showToast('error', 'conversation is not ready');
      return;
    }
    const pendingTask = createPendingTaskDraft(text, attachment, sanitizedImageAttachments);
    pendingTask.requestedModelId = modelId || '';
    // Match DEFAULT_REASONING_EFFORT in panels.jsx (kept in sync).
    pendingTask.requestedReasoningEffort = reasoningEffort || 'high';
    pendingTask.requestedProvider = 'auto';
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
      if (abortRef.current || error?.name === 'AbortError') {
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

  async function handleSelectConversation(projectId, nextConversationId) {
    const requestSeq = invalidateConversationActivation();
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
    if (!nextConversationId || nextConversationId === conversationId) {
      setWorkspaceState((state) => normalizeWorkspaceOrdering(stampActivation(state)));
      return;
    }
    setWorkspaceState((state) => normalizeWorkspaceOrdering(stampActivation(state)));
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

  async function createConversationInProject(project, title) {
    const createResponse = await authFetch(`${API_BASE}/api/conversations`, {
      method: 'POST',
      headers: buildApiHeaders(),
      body: JSON.stringify({ title }),
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
      body: JSON.stringify({ title: DEFAULT_SESSION_NAME }),
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
    let fallbackConversation = project.conversations.find((conversation) => conversation.id !== nextConversationId);
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
      // Same policy as the task loop above — keep cancelled pending tasks
      // visible so the user can see their cancelled request + the agent's
      // "Task was cancelled." marker.
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
              authUser={authUser}
              onLogout={onLogout}
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
              taskPreviewLimit={viewMode === 'chat' ? 3 : 5}
            />
            {viewMode === 'chat' ? (
              <div className="app-chat-stage">
                <div className="app-chat-main">
                  <window.ChatPanel
                    conversationId={conversationId}
                    messages={chatMessages}
                    running={busy || currentConversationActive}
                    disabled={busy || currentConversationActive || uploadState.active || calibrationMode || !conversationReady || conversationSelectionPending || !!conversationError}
                    onSend={(text, attachment, modelId, reasoningEffort, imageAttachments) => handleDeploy(text, attachment, modelId, reasoningEffort, imageAttachments)}
                    onStop={handleStop}
                    onSelectFile={(file) => { handleAttachmentSelect(file).catch((error) => console.error('attachment upload failed', error)); }}
                    onClearFile={handleAttachmentClear}
                    onUploadImage={uploadChatImage}
                    attachment={composerAttachment}
                    uploading={uploadState.active}
                    contextUsage={contextUsage}
                    workspacePath={localWorkspace.path}
                    homePath={window.haish?.homePath || ''}
                    activeTaskText={activeTaskText}
                    now={now}
                    modelOptions={modelOptions}
                    defaultModelId={defaultModelId}
                    modelLoading={providerLoading}
	                  />
	                </div>
	              </div>
	            ) : (
	              <>
                <div className="app-center-stage">
                  <window.MapViewport
                    MAP_W={MAP_W}
                    MAP_H={MAP_H}
                    onViewChange={setMapView}
                    overlay={<window.TaskDelegation onDeploy={handleDeploy} onStop={handleStop} onSelectFile={(file) => { handleAttachmentSelect(file).catch((error) => console.error('attachment upload failed', error)); }} onClearFile={handleAttachmentClear} attachment={composerAttachment} uploading={uploadState.active} running={busy || currentConversationActive} disabled={busy || currentConversationActive || uploadState.active || calibrationMode || !conversationReady || conversationSelectionPending || !!conversationError} contextUsage={contextUsage} workspacePath={localWorkspace.path} homePath={window.haish?.homePath || ''} activeTaskText={activeTaskText} modelOptions={modelOptions} defaultModelId={defaultModelId} modelLoading={providerLoading} />}
                  >
                    <div ref={stageRef} className="office-map">
                      {calibrationMode && calibrationTarget === 'routes' && selectedRouteId && <window.CalibrationRoutePreview routeId={selectedRouteId} mapW={MAP_W} mapH={MAP_H} />}
                      {Object.keys(window.STATIONS).map(id => <window.NPC key={id} id={id} state={npcStates[id]} spriteConfig={getCharPoseConfig(id)} mapW={MAP_W} mapH={MAP_H} showLabel={true} interactive={calibrationMode && !busy && calibrationTarget === 'stations'} selected={(selectedMarkerId === id && calibrationTarget === 'stations') || (selectedPoseNpcId === id && calibrationTarget === 'poses')} showDebug={calibrationMode && (calibrationTarget === 'stations' || (calibrationTarget === 'poses' && selectedPoseNpcId === id))} debugText={calibrationTarget === 'poses' ? `${(npcStates[id]?.poseDebug?.pose || 'idle').toUpperCase()} · ${(npcStates[id]?.poseDebug?.dir || 'front').toUpperCase()}` : `${(stationDrafts[id]?.x??0).toFixed(3)}, ${(stationDrafts[id]?.y??0).toFixed(3)}`} onPointerDown={(npcId, e) => handleMarkerPointerDown('stations', npcId, e)} />)}
                      {calibrationMode && calibrationTarget === 'routes' && activeIds.map((id, index) => <window.CalibrationPoint key={`${calibrationTarget}-${id}`} id={id} point={activeDrafts[id]} mapW={MAP_W} mapH={MAP_H} kind={resolvePointTarget(id)==='meet'?'meet':'nav'} selected={selectedMarkerId===id} showDebug={true} badgeText={index+1} onPointerDown={(pId, e) => handleMarkerPointerDown(calibrationTarget, pId, e)} />)}
                      <div className="fx-layer">{bursts.map(b => <div key={b.id} className="fx-ring" style={{ left: b.x, top: b.y, borderColor: b.color, boxShadow: `0 0 12px ${b.color}` }} />)}</div>
	                    </div>
	                  </window.MapViewport>
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
            : <span className="app-toast-icon app-toast-icon-error" aria-hidden="true" />}
          <span className="app-toast-message">{toast.message}</span>
        </div>
      )}

      <window.HollowPurple open={!!hollow} title={hollow?.title} result={hollow?.result} onClose={()=>setHollow(null)} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<AuthGate />);
