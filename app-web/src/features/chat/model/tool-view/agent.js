// Agent / 子 Agent / 视觉类工具：进度流、最终回答与子 Agent 时间线。
import { normalizeToolName } from '../tool-names.js';
import { createTerminalTimeline } from '../terminal-timeline.js';
import { cachedStreamEventBase } from '../stream-events.js';
import { getToolResponseTraceStatus, getToolTraceStatus } from '../tool-trace-status.js';
import {
  TOOL_BLOCK_LIMIT,
  compactToolValue,
  firstToolDisplayValue,
  getToolSubject,
  isToolFailure,
  toolActionLabel,
  toolJsonText,
  toolPlainObject,
} from './shared.js';

const TOOL_PROCESS_NAMES = new Set([
  'dispatch_sub_agent',
  'sub_agent',
  'subagent',
  'vision_analyze',
  'visual_inspect',
  'image_describe',
  'image_generate',
]);

// The backend publishes generated images under artifacts.images[].path; the
// preview endpoint turns that path into a URL the renderer can load.
function firstGeneratedImagePath(toolResponse) {
  const response = toolPlainObject(toolResponse);
  const artifacts = toolPlainObject(response.artifacts);
  const raw = artifacts.images;
  const candidates = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  for (const entry of candidates) {
    if (typeof entry === 'string' && entry.trim()) return entry.trim();
    if (entry && typeof entry === 'object') {
      const value = entry.path || entry.url || entry.artifact_path;
      if (value) return String(value).trim();
    }
  }
  return '';
}

function isVisualProcessTool(name) {
  return name === 'vision_analyze'
    || name === 'visual_inspect'
    || name === 'image_describe'
    || name === 'acceptance_check'
    || name.includes('visual')
    || name.includes('vision');
}

export function isProcessTool(item, name) {
  return item.category === 'subagent' || TOOL_PROCESS_NAMES.has(name) || isVisualProcessTool(name);
}

function toolStreamTextForEvent(event, item) {
  const type = String(event?.type || '');
  const text = compactToolValue(event?.summary || event?.message || event?.outputSummary || event?.inputSummary, TOOL_BLOCK_LIMIT);
  const normalizedText = text.trim().toLowerCase();
  if (type === 'sub_agent_answer_delta') return '';
  if (type === 'tool_call_started') return '';
  if (type === 'sub_agent_tool_call_completed' && (text.length > 180 || text.trim().startsWith('{') || text.includes('\n'))) return '';
  if (normalizedText === 'queued') return '';
  if (normalizedText === 'dispatched') return '';
  if (normalizedText === `${normalizeToolName(item.toolName)} started`) return '';
  if (normalizedText === `${toolActionLabel(item).toLowerCase()} started`) return '';
  if (normalizedText === 'the tool request has reached the tool manager.') return '';
  if (normalizedText === 'dispatched to internal tool executor.') return '';
  return text;
}

function buildToolStreamAnswerText(item) {
  const events = Array.isArray(item.progressEvents) ? item.progressEvents : [];
  return events
    .filter((event) => event?.type === 'sub_agent_answer_delta')
    .map((event) => String(event.message || event.summary || ''))
    .filter(Boolean)
    .join('');
}

function buildToolStreamLines(item) {
  const lines = [];
  const events = Array.isArray(item.progressEvents) ? item.progressEvents : [];
  events.forEach((event, index) => {
    const text = toolStreamTextForEvent(event, item);
    if (!text) return;
    const last = lines[lines.length - 1];
    if (last && last.text === text) return;
    lines.push({
      id: event.id || `${event.type || 'event'}-${index}`,
      state: event.state || event.type || '',
      text,
    });
  });
  if (!lines.length && item.outputSummary) {
    lines.push({ id: 'output-summary', state: 'completed', text: compactToolValue(item.outputSummary, TOOL_BLOCK_LIMIT) });
  }
  return lines;
}

function subAgentEventText(event) {
  return String(event?.message || event?.summary || event?.outputSummary || event?.inputSummary || '').trim();
}

function subAgentToolEventKey(event) {
  return event?.callId
    || event?.call_id
    || event?.toolCallId
    || event?.tool_call_id
    || '';
}

function subAgentToolNameKey(event) {
  return String(event?.toolName || event?.label || event?.summary || 'tool')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function findPendingSubAgentTool(items, event, pendingTools) {
  const nameKey = subAgentToolNameKey(event);
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (!pendingTools.has(item)) continue;
    if (subAgentToolNameKey(item) === nameKey) return item;
  }
  return null;
}

function subAgentToolCategory(event) {
  const explicit = String(event?.category || event?.toolCategory || event?.tool_category || '').trim();
  if (explicit) return explicit;
  const name = String(event?.toolName || '').trim();
  if (name.includes(' ')) return 'mcp';
  return 'tool';
}

const SUB_AGENT_TIMELINE_CACHE = new WeakMap();
const SUB_AGENT_TEXT_TYPES = new Set(['sub_agent_answer_delta', 'sub_agent_progress_delta']);
function subAgentText(event) {
  return event.type === 'sub_agent_answer_delta'
    ? String(event.message || event.summary || '') : subAgentEventText(event);
}

function incrementalSubAgentItems(events, status, base) {
  if (!base || base.cached.status !== status || base.prefixLength < base.events.length - 1) return null;
  const cached = base.cached;
  let text = cached.textBuffer;
  if (base.prefixLength < base.events.length) {
    const previous = base.events.at(-1);
    if (!SUB_AGENT_TEXT_TYPES.has(previous.type)) return null;
    const suffix = subAgentText(previous);
    if (!text.endsWith(suffix)) return null;
    if (suffix) text = text.slice(0, -suffix.length);
  }
  for (let index = base.prefixLength; index < events.length; index += 1) {
    const event = events[index];
    if (!SUB_AGENT_TEXT_TYPES.has(event.type)) return null;
    text += subAgentText(event);
  }
  const items = cached.items.slice(0, cached.tailIndex);
  if (text.trim()) items.push({ kind: 'text', id: `sub-text-${cached.textIndex}`, text: text.trim(), streaming: status === 'running' });
  const next = { ...cached, items, textBuffer: text };
  SUB_AGENT_TIMELINE_CACHE.set(events, next);
  return items;
}

// Structural child-tool events still replay to retain the terminal/session and
// legacy no-call-id semantics. Reuse equal records so unrelated cards stay memoized.
function reuseSubAgentItems(items, previous) {
  if (!previous) return items;
  const byId = new Map(previous.map((item) => [item.id, item]));
  return items.map((item) => {
    const old = byId.get(item.id);
    const keys = Object.keys(item);
    return old && Object.keys(old).length === keys.length && keys.every((key) => old[key] === item[key]) ? old : item;
  });
}

export function buildSubAgentTimelineItems(view) {
  const events = Array.isArray(view.progressEvents) ? view.progressEvents : [];
  const finalStatus = view.isRunning ? 'running' : view.cancelled ? 'cancelled' : view.failed ? 'failed' : 'done';
  const cached = SUB_AGENT_TIMELINE_CACHE.get(events);
  if (cached?.status === finalStatus) return cached.items;
  const base = cachedStreamEventBase(events, SUB_AGENT_TIMELINE_CACHE);
  const incremental = incrementalSubAgentItems(events, finalStatus, base);
  if (incremental) return incremental;
  const items = [];
  const toolItemsByKey = new Map();
  const pendingTools = new Set();
  const { findTerminalForInput, mergeTerminalResult } = createTerminalTimeline({ events, finalStatus });
  let textBuffer = '';
  let textIndex = 0;
  const flushText = (streaming = false) => {
    const value = textBuffer.trim();
    textBuffer = '';
    if (!value.trim()) return;
    items.push({
      kind: 'text',
      id: `sub-text-${textIndex}`,
      text: value,
      streaming,
    });
    textIndex += 1;
  };
  events.forEach((event, index) => {
    const type = String(event?.type || '');
    if (type === 'sub_agent_answer_delta' || type === 'sub_agent_progress_delta') {
      const value = type === 'sub_agent_answer_delta'
        ? String(event.message || event.summary || '') : subAgentEventText(event);
      if (value) textBuffer += value;
      return;
    }
    if (type === 'sub_agent_tool_call_started') {
      const key = subAgentToolEventKey(event) || `pending-${index}`;
      if (normalizeToolName(event.toolName) === 'write_stdin') {
        const parent = findTerminalForInput(event.toolInput);
        if (parent) {
          parent.status = getToolTraceStatus('running', finalStatus);
          toolItemsByKey.set(key, parent);
        }
        return;
      }
      flushText(false);
      const existing = toolItemsByKey.get(key);
      if (existing) {
        existing.toolInput = event.toolInput || existing.toolInput;
        existing.inputSummary = event.inputSummary || existing.inputSummary;
        return;
      }
      const item = {
        kind: 'tool',
        id: `sub-tool-${key}-${index}`,
        callId: key,
        category: subAgentToolCategory(event),
        status: getToolTraceStatus('running', finalStatus),
        toolName: event.toolName || event.summary || 'Tool',
        label: event.toolName || event.summary || 'Tool',
        inputSummary: event.inputSummary || event.summary || '',
        outputSummary: '',
        toolInput: event.toolInput || null,
        toolResponse: null,
        toolOutput: '',
      };
      items.push(item);
      pendingTools.add(item);
      if (subAgentToolEventKey(event)) toolItemsByKey.set(key, item);
      return;
    }
    if (type === 'sub_agent_tool_call_completed') {
      flushText(false);
      const key = subAgentToolEventKey(event);
      let item = key ? toolItemsByKey.get(key) : null;
      if (normalizeToolName(event.toolName) === 'write_stdin') {
        item ||= findTerminalForInput(event.toolInput);
        if (item) {
          if (key) toolItemsByKey.set(key, item);
          mergeTerminalResult(item, event, 'completed');
        }
        return;
      }
      // A supplied call id is authoritative. Name fallback is only for legacy
      // events without ids, never for a different concurrent invocation.
      if (!item && !key) item = findPendingSubAgentTool(items, event, pendingTools);
      if (!item) {
        const fallbackKey = key || `completed-${index}`;
        item = {
          kind: 'tool',
          id: `sub-tool-${fallbackKey}-${index}`,
          callId: fallbackKey,
          category: subAgentToolCategory(event),
          status: 'done',
          toolName: event.toolName || 'Tool',
          label: event.toolName || 'Tool',
          inputSummary: event.inputSummary || '',
          outputSummary: event.outputSummary || event.summary || '',
          toolInput: event.toolInput || null,
          toolResponse: event.toolResponse || null,
          toolOutput: event.toolOutput || '',
        };
        items.push(item);
        if (key) toolItemsByKey.set(key, item);
      }
      pendingTools.delete(item);
      if (normalizeToolName(item.toolName) === 'exec_command') {
        mergeTerminalResult(item, event, 'completed');
        return;
      }
      item.status = getToolResponseTraceStatus(toolPlainObject(event.toolResponse), 'done');
      item.outputSummary = event.outputSummary || event.summary || item.outputSummary || '';
      item.toolResponse = event.toolResponse || item.toolResponse || null;
      item.toolOutput = event.toolOutput || item.toolOutput || '';
    }
  });
  const tailIndex = items.length;
  const tailText = textBuffer;
  const tailTextIndex = textIndex;
  flushText(Boolean(view.isRunning));
  const shared = reuseSubAgentItems(items, (cached || base?.cached)?.items);
  SUB_AGENT_TIMELINE_CACHE.set(events, {
    status: finalStatus, items: shared, tailIndex, textBuffer: tailText, textIndex: tailTextIndex,
  });
  return shared;
}

function extractProcessResultText(item) {
  const response = toolPlainObject(item.toolResponse);
  const data = toolPlainObject(response.data);
  const verdict = toolPlainObject(data.verdict);
  const report = toolPlainObject(data.report);
  const error = toolPlainObject(response.error);
  // 不再截断 finalText：sub-agent / vision 完成答案需要完整展示。
  return compactToolValue(firstToolDisplayValue(
    data.answer,
    data.final_answer,
    data.text,
    verdict.summary,
    report.summary,
    data.summary,
    response.summary,
    error.message,
    item.outputSummary,
  ), TOOL_BLOCK_LIMIT);
}

function extractProcessChatMeta(item, name) {
  const input = getToolSubject(item);
  const task = firstToolDisplayValue(
    input.task,
    input.prompt,
    input.message,
    input.query,
    input.question,
    input.instruction,
    input.description,
    input.user_message,
  );
  const role = firstToolDisplayValue(
    input.role,
    input.agent_name,
    input.agent,
    input.sub_agent,
    input.subagent,
    input.name,
  );
  const systemPrompt = firstToolDisplayValue(
    input.system_prompt,
    input.system,
    input.systemPrompt,
    input.persona,
    input.instructions,
  );
  const isVision = isVisualProcessTool(name);
  const isImageGen = name === 'image_generate';
  const generatedImagePath = isImageGen ? firstGeneratedImagePath(item.toolResponse) : '';
  const mediaPath = isVision
    ? firstToolDisplayValue(input.media_path, input.image_path, input.path, input.image, input.file)
    : '';
  const visionMode = isVision ? firstToolDisplayValue(input.mode, input.task_type) : '';
  return {
    task: task ? String(task) : '',
    role: role ? String(role) : '',
    systemPrompt: systemPrompt ? String(systemPrompt) : '',
    mediaPath: mediaPath ? String(mediaPath) : '',
    visionMode: visionMode ? String(visionMode) : '',
    isVision,
    isImageGen,
    generatedImagePath,
  };
}

// The collapsed sub-agent header only needs its label/failure/disclosure state.
// Do not walk progress or stringify prompts/answers until its panel is mounted.
export function buildProcessToolSummary(item) {
  return {
    mode: 'process',
    label: item.category === 'subagent' ? (item.label || item.toolName || 'Sub-agent') : (item.label || toolActionLabel(item)),
    failed: isToolFailure(item),
    detailsDeferred: true,
    hasDetails: Boolean(item.toolInput || item.toolResponse || item.outputSummary || item.progressEvents?.length || item.children?.length),
  };
}

export function buildProcessToolView(item, name) {
  const response = toolPlainObject(item.toolResponse);
  // The rich child timeline normally owns these events. Build legacy fallback
  // strings only when a consumer actually needs them, not for every text delta.
  let streamLines;
  let streamAnswerText;
  const finalText = extractProcessResultText(item);
  const chatMeta = extractProcessChatMeta(item, name);
  return {
    mode: 'process',
    label: item.category === 'subagent'
      ? (item.label || item.toolName || 'Sub-agent')
      : (item.label || toolActionLabel(item)),
    requestJson: toolJsonText(item.toolInput),
    get streamLines() { return streamLines ??= buildToolStreamLines(item); },
    get streamAnswerText() { return streamAnswerText ??= buildToolStreamAnswerText(item); },
    progressEvents: Array.isArray(item.progressEvents) ? item.progressEvents : [],
    finalText,
    defaultOpen: false,
    task: chatMeta.task,
    role: chatMeta.role,
    systemPrompt: chatMeta.systemPrompt,
    mediaPath: chatMeta.mediaPath,
    visionMode: chatMeta.visionMode,
    isVision: chatMeta.isVision,
    isImageGen: chatMeta.isImageGen,
    generatedImagePath: chatMeta.generatedImagePath,
    failed: isToolFailure(item),
    error: compactToolValue(toolPlainObject(response.error).message || response.summary, TOOL_BLOCK_LIMIT),
    cancelled: item.status === 'cancelled',
    isRunning: item.status === 'running' || (chatMeta.isVision && (!item.status || item.status === 'pending')),
  };
}
