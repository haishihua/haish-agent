// @haish-esm
import { eventDeltaText } from './chat-text.js';
export { eventDeltaText } from './chat-text.js';
import { normalizeToolName } from '../panels/ChatTimeline.jsx';
import { DEFAULT_CONTEXT_TOTAL_TOKENS } from '../api/auth.js';
import { normalizeTaskStatus } from './task-runtime.js';
import { skillDisplayName } from './world-events.js';

export function getChatProgressLine(event) {
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

export function appendChatProgressText(current, line) {
  const nextLine = String(line || '').trim();
  if (!nextLine) return current || '';
  const existing = String(current || '').trimEnd();
  const lines = existing ? existing.split('\n').filter(Boolean) : [];
  if (lines[lines.length - 1] === nextLine) return existing;
  return [...lines, nextLine].slice(-12).join('\n');
}

export function appendAnswerDelta(current, delta) {
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


export function chatTraceToolName(value) {
  return String(value || 'tool').replace(/[_-]+/g, ' ').trim() || 'tool';
}

export function isSubAgentTraceItem(item) {
  const name = String(item?.toolName || item?.tool_name || '').toLowerCase();
  return name.includes('dispatch_sub_agent') || name.includes('sub_agent') || name.includes('subagent');
}

export function isSkillTraceItem(item) {
  const group = String(item?.toolGroup || item?.tool_group || '').toLowerCase();
  const kind = String(item?.kind || '').toLowerCase();
  return group === 'skill' || group === 'knowledge' || kind === 'skill' || Boolean(item?.skillName || item?.skill_name || item?.skillPath || item?.skill_path);
}

export function isMcpTraceItem(item) {
  const group = String(item?.toolGroup || item?.tool_group || '').toLowerCase();
  const kind = String(item?.kind || '').toLowerCase();
  const role = String(item?.executorRole || item?.executor_role || '').toLowerCase();
  return group === 'external' || kind === 'mcp' || role.includes('external tool');
}

export function getToolTraceSection(item) {
  if (isSubAgentTraceItem(item)) return 'subagents';
  if (isSkillTraceItem(item)) return 'skills';
  if (isMcpTraceItem(item)) return 'mcp';
  return 'tools';
}

export function getToolTraceStatus(state, fallbackStatus = 'running') {
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

export function getToolResponseTraceStatus(response, fallback = '') {
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

export function formatTraceTokens(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return '';
  if (number >= 1000) return `${(number / 1000).toFixed(number >= 10000 ? 0 : 1)}k`;
  return String(Math.round(number));
}

export function pushTraceItem(sectionMap, sectionId, item) {
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

export function upsertTraceItem(sectionMap, sectionId, item) {
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

export function formatMetaDetail(event) {
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
      const usedValue = Number(event.usedTokens ?? event.used_tokens ?? 0);
      const totalValue = Number(event.totalTokens ?? event.total_tokens ?? DEFAULT_CONTEXT_TOTAL_TOKENS);
      if (event.valid_context_usage === false || (usedValue > 0 && totalValue > 0 && usedValue > totalValue)) return '';
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

export function categorizeToolCall(call) {
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

export function mcpServerNameFromToolName(toolName) {
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
export function classifyToolForGroup(item) {
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

export function summarizeToolGroup(tools, status = 'done') {
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
  // chip stays single-line. The click-to-expand list below still shows each
  // original tool call.
  const MAX_VISIBLE = 3;
  if (parts.length > MAX_VISIBLE) {
    const visible = parts.slice(0, MAX_VISIBLE);
    const hidden = parts.length - MAX_VISIBLE;
    return { short: `${visible.join(' · ')} · +${hidden} more` };
  }
  const joined = parts.join(' · ');
  return { short: joined };
}

export function aggregateGroupStatus(tools) {
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
export function groupConsecutiveTools(items) {
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

export function timelineToolLabel(call, category) {
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

export function toolProgressSummary(event) {
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

export function buildChatTimeline(task, taskStatus) {
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

  let textBufSource = 'progress';
  const flushText = () => {
    const value = textBuf.trim();
    const source = textBufSource;
    textBuf = '';
    textBufSource = 'progress';
    if (!value.trim()) return;
    items.push({
      kind: 'text',
      id: `text-${textSegmentIndex}`,
      text: value,
      source,
      streaming: false,
    });
    textSegmentIndex += 1;
    currentSkillItem = null;
  };

  for (const event of events) {
    const type = event.type;
    if (type === 'llm_thinking_delta') {
      thinkingBuf += eventDeltaText(event);
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
      textBuf += eventDeltaText(event);
      textBufSource = 'answer';
      continue;
    }
    if (type === 'agent_progress_delta') {
      flushThinking(false);
      if (textBuf.trim()) flushText();
      textBuf += event.message || '';
      textBufSource = 'progress';
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
      text: textBuf.trim(),
      source: textBufSource,
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

export function extractTodosFromToolItem(item) {
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

export function pendingTaskToQuest(pendingTask) {
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


