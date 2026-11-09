// 工具调用的分类、连续分组、分组摘要与活动判定。时间线只消费这里的结果。

import { eventDeltaText } from '../../../core/message-text.js';
import { normalizeToolName } from '../../../core/tool-names.js';
import { skillDisplayName } from '../../../core/runtime-events.js';
import { skillTrigger } from '../../../core/tool-presentation.js';
import { RUN_STATE_APPROVAL, RUN_STATE_WAITING_INPUT } from '../../../core/run-status.js';

function chatTraceToolName(value) {
  return String(value || 'tool').replace(/[_-]+/g, ' ').trim() || 'tool';
}

function isSubAgentTraceItem(item) {
  const name = String(item?.toolName || item?.tool_name || '').toLowerCase();
  return name.includes('dispatch_sub_agent') || name.includes('sub_agent') || name.includes('subagent');
}

function isSkillTraceItem(item) {
  return Boolean(skillTrigger(item));
}

function isMcpTraceItem(item) {
  const group = String(item?.toolGroup || item?.tool_group || '').toLowerCase();
  const kind = String(item?.kind || '').toLowerCase();
  return group === 'external' || kind === 'mcp';
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

function mcpServerNameFromToolName(toolName) {
  const s = normalizeToolName(toolName);
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
  if (name === 'exec_command' || name === 'write_stdin') {
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
  if (name === 'list_checkpoints') {
    // 只查不改：分组 chip 不能写 “snapshotted”（那是回滚那一半的动词）。
    return { bucket: 'snapshot', verbPast: 'checked', verbPresent: 'checking', subject: '', unitSingular: 'checkpoint', unitPlural: 'checkpoints' };
  }
  if (name.includes('checkpoint') || name.includes('rollback')) {
    return { bucket: 'snapshot', verbPast: 'snapshotted', verbPresent: 'snapshotting', subject: '', unitSingular: 'checkpoint', unitPlural: 'checkpoints' };
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
    'noted', 'snapshot',
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

const SEARCH_ACTIVITY_BUCKETS = new Set(['read', 'searched', 'fetched', 'visualized']);

export function resolveAgentActivity(items, streaming = false, waitState = '') {
  if (!streaming) return null;
  // 「在等人」由会话状态判据给（后端实时快照），不再看时间线上有没有 ask_user 卡片：
  // 卡片是渲染结果，快照才是状态。用户一提交答案，快照清空，这里立刻回到在跑的文案。
  if (waitState === RUN_STATE_WAITING_INPUT) return { state: 'listening', label: 'Waiting for you…' };
  if (waitState === RUN_STATE_APPROVAL) return { state: 'listening', label: 'Awaiting approval…' };
  const safeItems = Array.isArray(items) ? items : [];
  const tools = safeItems.flatMap((item) => (
    item?.kind === 'tool_group' ? item.tools || [] : item?.kind === 'tool' ? [item] : []
  ));
  const activeTools = tools.filter((item) => ['pending', 'running'].includes(String(item?.status || '')));

  if (activeTools.some((item) => SEARCH_ACTIVITY_BUCKETS.has(classifyToolForGroup(item).bucket))) {
    return { state: 'searching', label: 'Searching…' };
  }
  if (activeTools.length) return { state: 'working', label: 'Working…' };

  const latest = safeItems.at(-1);
  if (latest?.kind === 'thinking' && (latest.streaming || latest.status === 'running')) {
    return { state: 'composing', label: 'Thinking…' };
  }
  if (latest?.kind === 'text' || tools.length) return { state: 'solving', label: 'Solving…' };
  return { state: 'composing', label: 'Thinking…' };
}

// Walk a built timeline and collapse runs of consecutive tool chips (≥ 2) into
// a single `tool_group` item. Skills and sub-agents are left untouched —
// skills carry nested children that need their own affordance, sub-agents
// are distinct narrative moments.
//
// Exported for the mobile remote app (haish-agent-remote/src/App.jsx), which
// reuses this walk to render the same tool grouping on the phone.
export function groupConsecutiveTools(items) {
  const result = [];
  const isGroupable = (it) => (
    it && it.kind === 'tool'
    && it.category !== 'skill'
    && it.category !== 'subagent'
    // ask_user owns an inline answer form and must remain a stable top-level
    // timeline item. Grouping it would remove its chip/slot during rerenders.
    && normalizeToolName(it.toolName) !== 'ask_user'
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
        // Anchor the React key to the first call in the run. A positional key
        // changes when an earlier live event creates/splits another group,
        // remounting this group and losing its expanded state.
        id: `tool-group-${run[0]?.id || groupIdx}`,
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
    const skill = skillTrigger(call);
    if (skill) return skill.name;
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
    case 'tool_call_started':
      return event.inputSummary || message || `${toolName} requested.`;
    case 'tool_call_completed':
      return event.outputSummary || message || `${toolName} completed.`;
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
    case 'sub_agent_tool_call_started':
      return message || `${event.role || 'Sub-agent'} requested ${toolName}.`;
    case 'sub_agent_tool_call_completed':
      return event.outputSummary || message || `${toolName} completed.`;
    default:
      return message || event.inputSummary || event.outputSummary || '';
  }
}

export const SUB_AGENT_PROGRESS_TYPES = new Set([
  'sub_agent_started', 'sub_agent_finished', 'sub_agent_progress_delta',
  'sub_agent_answer_delta', 'sub_agent_tool_call_started', 'sub_agent_tool_call_completed',
]);

export function progressEventFor(toolItem, event, index, state = '') {
  const summary = event.type === 'sub_agent_answer_delta' ? eventDeltaText(event) : toolProgressSummary(event);
  if (!summary) return null;
  return {
    id: `${toolItem.id}-${event.type}-${index}`,
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
    message: event.type === 'sub_agent_answer_delta' ? summary : event.message || '',
    inputSummary: event.inputSummary || '',
    outputSummary: event.outputSummary || '',
    timestamp: event.timestamp || null,
  };
}

export function subAgentProgressState(type) {
  if (type === 'sub_agent_answer_delta') return 'stream';
  if (type === 'sub_agent_started') return 'running';
  if (type === 'sub_agent_finished') return 'completed';
  if (type === 'sub_agent_tool_call_started') return 'requested';
  if (type === 'sub_agent_tool_call_completed') return 'completed';
  return 'progress';
}

export function toolPathsIn(items, eventToolCallIds, path = [], paths = new Map()) {
  items.forEach((item, index) => {
    const itemPath = [...path, index];
    if (eventToolCallIds.has(item.callId)) paths.set(item.callId, itemPath);
    for (const key of ['children', 'tools']) {
      if (item[key]?.length) toolPathsIn(item[key], eventToolCallIds, [...itemPath, key], paths);
    }
  });
  return paths;
}

export const atPath = (value, path) => path.reduce((current, key) => current[key], value);
export function replaceAtPath(value, path, next) {
  if (!path.length) return next;
  const [key, ...rest] = path;
  const copy = Array.isArray(value) ? value.slice() : { ...value };
  copy[key] = replaceAtPath(value[key], rest, next);
  return copy;
}

// Sub-agent events only alter their owner's progress list: main-agent text,
// tool order/grouping and sibling tools are unchanged. Structural/control-plane
// transitions still use the authoritative full replay below.
