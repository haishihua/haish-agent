// @haish-esm
import { stripChatImageAugmentation, eventDeltaText } from './chat-text.js';
import { PROVIDER_ACTOR_MAP } from './world-runtime.js';

export const WORLD_EVENT_ROUTE_MAP = {
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

export const WORLD_SCENE_EVENT_TYPES = new Set([
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

export const SCENE_CATCHUP_KEEP_TYPES = new Set([
  'tool_result_returned',
  'llm_final_answer',
  'agent_gateway_reported',
]);

export const SCENE_TERMINAL_EVENT_TYPES = new Set([
  'llm_final_answer',
  'agent_gateway_reported',
  'run_finished',
  'run_error',
  'run_cancelled',
]);

export const CHAT_FINAL_FOLLOWUP_EVENT_TYPES = new Set([
  'agent_gateway_reported',
  'context_compaction_started',
  'context_compaction_completed',
  'context_usage_updated',
  'run_finished',
  'run_error',
  'run_cancelled',
]);

export const STREAM_IMMEDIATE_EVENT_TYPES = new Set([
  'context_compaction_started',
  'context_compaction_completed',
  'llm_thinking_delta',
  'llm_answer_delta',
  'agent_progress_delta',
  'sub_agent_progress_delta',
  'sub_agent_answer_delta',
]);

export const SCENE_CATCHUP_TOOL_EVENT_TYPES = new Set([
  'tool_manager_received',
  'tool_dispatched',
  'tool_executor_started',
  'tool_executor_completed',
  'tool_result_returned',
]);

export const PROVIDER_SCENE_EVENT_TYPES = new Set([
  'provider_selected',
  'llm_thinking_started',
  'llm_thinking_completed',
  'agent_progress_delta',
  'llm_tool_call_requested',
  'llm_answer_delta',
  'llm_final_answer',
]);

export const WORLD_EVENT_TYPE_ALIASES = {
  gateway_received: 'agent_gateway_received',
  gateway_reported: 'agent_gateway_reported',
  llm_started: 'llm_thinking_started',
  answer_delta: 'llm_answer_delta',
  text_delta: 'llm_answer_delta',
  message_delta: 'llm_answer_delta',
  content_delta: 'llm_answer_delta',
  thinking_delta: 'llm_thinking_delta',
  reasoning_delta: 'llm_thinking_delta',
  final_answer: 'llm_final_answer',
  task_completed: 'run_finished',
};

export const WORLD_EVENT_TAG_MAP = {
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

export const WORLD_KIND_TAG_MAP = {
  think: 'THINKING',
  llm: 'THINKING',
  tool: 'EXECUTING',
  mcp: 'EXECUTING',
  skill: 'EXECUTING',
  deliver: 'DELIVER',
  report: 'REPORT',
};


export function getWorldEventTag(eventType, kind) {
  return WORLD_EVENT_TAG_MAP[eventType] || WORLD_KIND_TAG_MAP[kind] || 'WORKING';
}

export function executorActorForToolGroup(toolGroup) {
  if (toolGroup === 'knowledge') return 'mikey';
  if (toolGroup === 'internal') return 'levi';
  if (toolGroup === 'external') return 'itachi';
  return null;
}

export function sceneKeyForWorldEvent(event, executorActorId) {
  if (event.type === 'tool_dispatched' || event.type === 'tool_executor_completed') {
    if (event.tool_group === 'skill') return `${event.type}:skill`;
    return `${event.type}:${executorActorId || ''}`;
  }
  return event.type;
}

export function defaultQuestDescription(text) {
  const displayText = stripChatImageAugmentation(text).text;
  return displayText ? `Triggered by user input: ${displayText}` : 'Triggered by user input.';
}

export function summarizeText(text, limit = 88) {
  const compact = String(text || '').replace(/\s+/g, ' ').trim();
  if (!compact) return '';
  return compact.length <= limit ? compact : `${compact.slice(0, limit - 3)}...`;
}

export function toDisplayText(value) {
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

export function skillDisplayName(event) {
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

export function skillLoadingBubble(event, providerMeta) {
  return `${providerMeta.label} loading ${skillDisplayName(event)}`;
}

export function skillReadyBubble(event) {
  return event?.output_summary || `${skillDisplayName(event)} loaded. Skill context ready.`;
}

export function normalizeWorldEvent(raw) {
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

export function normalizeWorldEvents(events) {
  if (!Array.isArray(events)) return [];
  return events
    .map((event) => normalizeWorldEvent(event))
    .filter(Boolean);
}

export function worldEventToRuntimeLog(event) {
  const deltaText = eventDeltaText(event);
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
    message: toDisplayText(event.message || deltaText || event.content || null),
    loopIndex: event.loop_index || 0,
  };
}

export function getLoopIndexFromWorldEvents(events) {
  return events.reduce((max, event) => Math.max(max, event.loop_index || 0), 0);
}

export function getActiveRoleFromWorldEvents(events) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const actor = events[index]?.actor;
    if (actor) return actor;
  }
  return null;
}

export function normalizeProviderKey(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'deepseek';
  if (normalized === 'auto' || normalized === 'generic' || normalized === 'default') return 'generic';
  if (normalized.includes('anthropic') || normalized.includes('claude')
      || normalized.includes('opus') || normalized.includes('sonnet') || normalized.includes('haiku')) {
    return 'anthropic';
  }
  if (normalized.includes('deepseek')) return 'deepseek';
  if (normalized.includes('openai') || normalized.includes('gpt')) return 'openai';
  if (normalized.includes('xai') || normalized.includes('grok')) return 'xai';
  if (normalized.includes('qwen') || normalized.includes('dashscope')) return 'dashscope';
  if (normalized.includes('glm') || normalized.includes('zhipu')) return 'zhipu';
  if (normalized.includes('kimi') || normalized.includes('moonshot')) return 'moonshot';
  if (normalized.includes('minimax')) return 'minimax';
  if (normalized.includes('gemini')) return 'gemini';
  if (normalized === 'local') return 'ollama';
  return normalized;
}

export function resolveProviderMeta(...sources) {
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

