// @haish-esm
import React from 'react';
import {
  Markdown } from '../Effects.jsx';
import { CHAR_DEFS } from '../Sprites.jsx';
import { PortalTooltip } from './PortalTooltip.jsx';
import { fmtAgo,
  AttachmentFileChip,
  } from './Format.jsx';
import { formatElapsedDuration,
  formatMessageClock,
  handlePathPaste,
  formatContextUsageLabel,
  usePersistentRunConfig,
  modelsForRunProvider,
  copyTextToClipboard,
} from './path-utils.jsx';
import { MODEL_OPTIONS, DEFAULT_AGENT_OPTIONS, CATEGORY_ICON_CLASS, CATEGORY_LABEL } from './shared-constants.jsx';

import {
  ApprovalModePicker,
  ModelPicker,
} from './ModelPickers.jsx';
export function resolveToolIconClass(toolName, defaultClass) {
  const name = String(toolName || '').toLowerCase();
  if (!name) return defaultClass;
  if (name === 'workspace_artifact') {
    return 'ico-workspace-artifact';
  }
  if (name === 'vision_analyze' || name === 'visual_inspect') {
    return 'ico-visual-inspect';
  }
  if (name === 'image_describe') {
    return 'ico-image-describe';
  }
  if (name === 'terminal') {
    return 'ico-terminal';
  }
  if (name === 'copy_file') {
    return 'ico-copy-file';
  }
  if (name === 'create_dir') {
    return 'ico-create-dir';
  }
  if (name === 'delete_file') {
    return 'ico-delete-file';
  }
  if (name === 'list_dir') {
    return 'ico-list-dir';
  }
  if (name === 'glob_files') {
    return 'ico-glob-files';
  }
  if (name.includes('checkpoint') || name.includes('rollback')) {
    return 'ico-checkpoint';
  }
  if (name.includes('background_process')) {
    return 'ico-background-process';
  }
  if (name.startsWith('note_')) {
    return 'ico-note';
  }
  if (name === 'search_text') {
    return 'ico-search-text';
  }
  if (name === 'edit_file' || name === 'replace_lines' || name === 'multi_edit' || name === 'apply_patch') {
    return 'ico-file-write';
  }
  if (name.startsWith('document_') || name.includes('rag') || name.includes('knowledge') || name.includes('retrieve')
      || name.includes('vector') || name.includes('embed')) {
    return 'ico-rag';
  }
  if (name.includes('memory') || name.includes('remember') || name.includes('recall')) {
    return 'ico-memory';
  }
  if (name.includes('weather') || name.includes('forecast') || name.includes('temperature')) {
    return 'ico-weather';
  }
  if (name.includes('write') || name.includes('create_file') || name.includes('save_file') || name.includes('patch')) {
    return 'ico-file-write';
  }
  if (name.includes('read_file') || name.includes('read_text') || name.includes('open_file')
      || name.includes('cat_file') || name.includes('view_file')) {
    return 'ico-file-read';
  }
  if (name.includes('web') || name.includes('search') || name.includes('fetch')
      || name.includes('http') || name.includes('url')) {
    return 'ico-web';
  }
  return defaultClass;
}

/**
 * 复用的 collapse/expand chevron。
 * 用 inline SVG 而不是 <img src=...png>——因为全局 body 有 `image-rendering: pixelated`
 * 会把任何位图强制走最邻近缩放、变得很糊。SVG 是矢量，不受影响。
 * fill="currentColor" 让箭头颜色跟随容器 color（比如折叠胶囊的金色）。
 *
 * open=false → ▸ (next, 朝右)
 * open=true  → ▾ (down, 朝下)
 */
export function ChatTimelineChevron({ open }) {
  return (
    <svg
      className={`chat-timeline-chevron ${open ? 'is-open' : ''}`}
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {open
        ? <polyline points="6 9 12 16 18 9" />   /* down */
        : <polyline points="9 6 16 12 9 18" />   /* next */}
    </svg>
  );
}

export const TOOL_READ_NAMES = new Set(['read_file', 'search_text', 'glob_files', 'list_dir']);
export const TOOL_DIFF_NAMES = new Set(['write_file', 'edit_file', 'replace_lines', 'multi_edit', 'apply_patch']);
export const TOOL_CHANGE_NAMES = new Set([
  'write_file',
  'edit_file',
  'replace_lines',
  'multi_edit',
  'apply_patch',
  'create_file',
  'delete_file',
  'copy_file',
  'create_dir',
]);
export const TOOL_SHELL_NAMES = new Set([
  'terminal',
  'start_background_process',
  'background_process_status',
  'read_background_process_output',
  'stop_background_process',
  'list_background_processes',
]);
export const TOOL_PROCESS_NAMES = new Set([
  'dispatch_sub_agent',
  'sub_agent',
  'subagent',
  'vision_analyze',
  'visual_inspect',
  'image_describe',
]);
export const TOOL_BLOCK_LIMIT = 16000;
export const TOOL_SHELL_TAIL_LINES = 80;
export const TOOL_SHELL_TAIL_CHARS = 8192;
export const TOOL_JSON_STRING_LIMIT = 2000;
export const TOOL_JSON_ARRAY_LIMIT = 20;
export const TOOL_JSON_DEPTH_LIMIT = 4;
export const TOOL_SUMMARY_VALUE_LIMIT = 420;
export const TOOL_JSON_OMIT_KEYS = new Set([
  'meta',
  'metadata',
  'limits',
  'references',
  'raw',
  'raw_content',
  'html',
  'base64',
  'bytes',
  'image',
  'images',
  'screenshot',
  'trace',
  'debug',
  'stack',
  'tool_input',
  'tool_output',
  'tool_response',
  'tool_call',
  'tool_call_id',
]);
export const TOOL_ARTIFACT_KEEP_KEYS = new Set([
  'preview',
  'output',
  'content',
  'text',
  'stdout',
  'stderr',
  'log_preview',
]);
export function compactToolText(value, limit = TOOL_BLOCK_LIMIT) {
  const text = String(value ?? '');
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 24)}\n... output truncated ...`;
}

export function stableJson(value) {
  try {
    return compactToolText(JSON.stringify(value, null, 2));
  } catch {
    return compactToolText(String(value ?? ''));
  }
}

export function compactToolValue(value, limit = TOOL_SUMMARY_VALUE_LIMIT) {
  if (value == null) return '';
  const text = typeof value === 'string' ? value : stableJson(value);
  return truncateToolString(text.replace(/\n{3,}/g, '\n\n').trim(), limit);
}

export function truncateToolString(value, limit = TOOL_JSON_STRING_LIMIT) {
  const text = String(value ?? '');
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 18)}... truncated ...`;
}

export function tailToolOutput(value) {
  const text = String(value ?? '');
  if (!text.trim()) return 'No output.';
  const lineTail = text.split('\n').slice(-TOOL_SHELL_TAIL_LINES).join('\n');
  if (lineTail.length <= TOOL_SHELL_TAIL_CHARS) {
    return lineTail.length < text.length
      ? `... output truncated, showing tail ...\n${lineTail}`
      : lineTail;
  }
  return `... output truncated, showing tail ...\n${lineTail.slice(-TOOL_SHELL_TAIL_CHARS)}`;
}

export function summarizeProgressEvents(events) {
  if (!Array.isArray(events)) return [];
  return events
    .map((event) => {
      if (!event) return '';
      const state = String(event.state || '').trim();
      const summary = compactToolValue(event.summary || event.outputSummary || event.inputSummary || event.message, 760);
      if (!summary) return '';
      return state ? `${state}: ${summary}` : summary;
    })
    .filter(Boolean);
}

export function sanitizeToolJson(value, depth = 0, keyName = '') {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return truncateToolString(value);
  if (depth >= TOOL_JSON_DEPTH_LIMIT) return '[Object truncated]';
  if (Array.isArray(value)) {
    const items = value.slice(0, TOOL_JSON_ARRAY_LIMIT).map((item) => sanitizeToolJson(item, depth + 1));
    if (value.length > TOOL_JSON_ARRAY_LIMIT) {
      items.push(`... ${value.length - TOOL_JSON_ARRAY_LIMIT} more item(s) ...`);
    }
    return items;
  }
  if (typeof value !== 'object') return truncateToolString(value);
  const key = String(keyName || '').toLowerCase();
  if (key === 'artifacts') {
    const artifacts = {};
    Object.entries(value).forEach(([artifactKey, artifactValue]) => {
      if (!TOOL_ARTIFACT_KEEP_KEYS.has(String(artifactKey).toLowerCase())) return;
      artifacts[artifactKey] = sanitizeToolJson(artifactValue, depth + 1, artifactKey);
    });
    return Object.keys(artifacts).length ? artifacts : undefined;
  }
  const result = {};
  Object.entries(value).forEach(([entryKey, entryValue]) => {
    const normalizedKey = String(entryKey).toLowerCase();
    if (TOOL_JSON_OMIT_KEYS.has(normalizedKey)) return;
    const sanitized = sanitizeToolJson(entryValue, depth + 1, entryKey);
    if (sanitized !== undefined) result[entryKey] = sanitized;
  });
  return result;
}

export function compactToolJsonPayload(input, output) {
  const payload = {};
  if (input) payload.input = sanitizeToolJson(input);
  if (output) {
    if (output && typeof output === 'object') {
      payload.output = sanitizeToolJson({
        status: output.status,
        result_state: output.result_state,
        summary: output.summary,
        subject: output.subject,
        data: output.data,
        artifacts: output.artifacts,
        error: output.error,
      });
    } else {
      payload.output = sanitizeToolJson(output);
    }
  }
  return payload;
}

export function isEmptyToolJsonValue(value) {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

export function toolJsonText(value, limit = TOOL_BLOCK_LIMIT) {
  if (value == null || value === '') return '';
  const sanitized = sanitizeToolJson(value);
  if (isEmptyToolJsonValue(sanitized)) return '';
  return compactToolText(JSON.stringify(sanitized, null, 2), limit);
}

export function outputJsonText(output) {
  if (output == null || output === '') return '';
  if (output && typeof output === 'object') {
    const payload = compactToolJsonPayload(undefined, output);
    return toolJsonText(payload.output || sanitizeToolJson(output));
  }
  return toolJsonText(output);
}

export function normalizeToolName(toolName) {
  return String(toolName || '').trim().toLowerCase();
}

export function toolPlainObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const text = value.trim();
    if (text.startsWith('{') && text.endsWith('}')) {
      try {
        const parsed = JSON.parse(text);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
      } catch {
        return {};
      }
    }
  }
  return {};
}

export function isToolFailure(item) {
  const status = String(item?.status || '').toLowerCase();
  if (status === 'failed' || status === 'error') return true;
  const response = toolPlainObject(item?.toolResponse);
  const responseStatus = String(response.status || '').toLowerCase();
  const resultState = String(response.result_state || response.resultState || response.state || '').toLowerCase();
  return Boolean(response.error)
    || responseStatus === 'error'
    || responseStatus === 'failed'
    || resultState === 'blocked'
    || resultState === 'failed'
    || resultState === 'error';
}

export function firstToolDisplayValue(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && !value.trim()) continue;
    return value;
  }
  return '';
}

export function isRawToolResponseText(value) {
  return String(value || '').trimStart().startsWith('TOOL_RESPONSE');
}

export function isVisualProcessTool(name) {
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

export function getToolSubject(item) {
  const response = toolPlainObject(item.toolResponse);
  const subject = toolPlainObject(response.subject);
  const input = toolPlainObject(item.toolInput);
  return {
    ...input,
    ...subject,
  };
}

export function firstToolPath(item) {
  const subject = getToolSubject(item);
  if (subject.path) return String(subject.path);
  if (subject.source_path && subject.destination_path) return `${subject.source_path} -> ${subject.destination_path}`;
  if (subject.destination_path) return String(subject.destination_path);
  if (subject.source_path) return String(subject.source_path);
  if (subject.pattern) return String(subject.pattern);
  if (subject.query) return String(subject.query);
  if (subject.command) return String(subject.command);
  return '';
}

export function toolStreamTextForEvent(event, item) {
  const type = String(event?.type || '');
  const text = compactToolValue(event?.summary || event?.message || event?.outputSummary || event?.inputSummary, TOOL_BLOCK_LIMIT);
  const normalizedText = text.trim().toLowerCase();
  if (type === 'sub_agent_answer_delta') return '';
  if (type === 'llm_tool_call_requested') return '';
  if (type === 'tool_manager_received') return '';
  if (type === 'tool_dispatched') return '';
  if (type === 'tool_executor_started') return '';
  if (type === 'sub_agent_tool_executor_completed' && (text.length > 180 || text.trim().startsWith('{') || text.includes('\n'))) return '';
  if (normalizedText === 'queued') return '';
  if (normalizedText === 'dispatched') return '';
  if (normalizedText === `${normalizeToolName(item.toolName)} started`) return '';
  if (normalizedText === `${toolActionLabel(item).toLowerCase()} started`) return '';
  if (normalizedText === 'the tool request has reached the tool manager.') return '';
  if (normalizedText === 'dispatched to internal tool executor.') return '';
  return text;
}

export function buildToolStreamAnswerText(item) {
  const events = Array.isArray(item.progressEvents) ? item.progressEvents : [];
  return events
    .filter((event) => event?.type === 'sub_agent_answer_delta')
    .map((event) => String(event.message || event.summary || '').trimEnd())
    .filter(Boolean)
    .join('');
}

export function buildToolStreamLines(item) {
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

export function subAgentEventText(event) {
  return String(event?.message || event?.summary || event?.outputSummary || event?.inputSummary || '').trim();
}

export function subAgentToolEventKey(event) {
  return event?.callId
    || event?.toolCallId
    || event?.tool_call_id
    || '';
}

export function subAgentToolNameKey(event) {
  return String(event?.toolName || event?.label || event?.summary || 'tool')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function findPendingSubAgentTool(items, event) {
  const nameKey = subAgentToolNameKey(event);
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (!item || item.kind !== 'tool' || item.status === 'done') continue;
    if (subAgentToolNameKey(item) === nameKey) return item;
  }
  return null;
}

export function subAgentToolCategory(event) {
  const explicit = String(event?.category || event?.toolCategory || event?.tool_category || '').trim();
  if (explicit) return explicit;
  const name = String(event?.toolName || '').trim();
  if (name.includes(' ')) return 'mcp';
  return 'tool';
}

export function buildSubAgentTimelineItems(view) {
  const events = Array.isArray(view.progressEvents) ? view.progressEvents : [];
  const items = [];
  const toolItemsByKey = new Map();
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
      const value = subAgentEventText(event);
      if (value) textBuffer += value;
      return;
    }
    if (type === 'sub_agent_tool_call_requested') {
      flushText(false);
      const key = subAgentToolEventKey(event) || `pending-${index}`;
      const item = {
        kind: 'tool',
        id: `sub-tool-${key}-${index}`,
        category: subAgentToolCategory(event),
        status: 'running',
        toolName: event.toolName || event.summary || 'Tool',
        label: event.toolName || event.summary || 'Tool',
        inputSummary: event.inputSummary || event.summary || '',
        outputSummary: '',
        toolInput: event.toolInput || null,
        toolResponse: null,
        toolOutput: '',
      };
      items.push(item);
      if (subAgentToolEventKey(event)) toolItemsByKey.set(key, item);
      return;
    }
    if (type === 'sub_agent_tool_executor_completed') {
      flushText(false);
      const key = subAgentToolEventKey(event);
      let item = key ? toolItemsByKey.get(key) : null;
      if (!item) item = findPendingSubAgentTool(items, event);
      if (!item) {
        const fallbackKey = key || `completed-${index}`;
        item = {
          kind: 'tool',
          id: `sub-tool-${fallbackKey}-${index}`,
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
        return;
      }
      item.status = 'done';
      item.outputSummary = event.outputSummary || event.summary || item.outputSummary || '';
      item.toolResponse = event.toolResponse || item.toolResponse || null;
      item.toolOutput = event.toolOutput || item.toolOutput || '';
    }
  });
  flushText(Boolean(view.isRunning));
  return items;
}

export function extractProcessResultText(item) {
  const response = toolPlainObject(item.toolResponse);
  const data = toolPlainObject(response.data);
  const verdict = toolPlainObject(data.verdict);
  const report = toolPlainObject(data.report);
  const error = toolPlainObject(response.error);
  // 不再截断 finalText：sub-agent / vision 完成答案需要完整展示。
  return compactToolValue(firstToolDisplayValue(
    data.answer,
    data.final_answer,
    verdict.summary,
    report.summary,
    data.summary,
    response.summary,
    error.message,
    item.outputSummary,
  ), TOOL_BLOCK_LIMIT);
}

export function extractTerminalOutput(item, response, artifacts, data) {
  const rawToolOutput = isRawToolResponseText(item.toolOutput) ? '' : item.toolOutput;
  return firstToolDisplayValue(
    artifacts.output,
    artifacts.content,
    artifacts.text,
    artifacts.stdout,
    data.stdout,
    data.output,
    rawToolOutput,
  );
}

export function toolDisplayOutput(item) {
  if (item.toolResponse) return item.toolResponse;
  if (isRawToolResponseText(item.toolOutput)) return item.outputSummary || undefined;
  return item.toolOutput || item.outputSummary || undefined;
}

export function toolLineDelta(item, diffText) {
  const data = item.toolResponse && typeof item.toolResponse === 'object' && item.toolResponse.data
    ? item.toolResponse.data
    : {};
  const explicitAdded = Number(data.added_lines);
  const explicitRemoved = Number(data.removed_lines);
  if (Number.isFinite(explicitAdded) || Number.isFinite(explicitRemoved)) {
    return {
      added: Number.isFinite(explicitAdded) ? explicitAdded : 0,
      removed: Number.isFinite(explicitRemoved) ? explicitRemoved : 0,
    };
  }
  let added = 0;
  let removed = 0;
  String(diffText || '').split('\n').forEach((line) => {
    if (line.startsWith('+++') || line.startsWith('---')) return;
    if (line.startsWith('+')) added += 1;
    if (line.startsWith('-')) removed += 1;
  });
  return { added, removed };
}

export function getToolDiff(item) {
  const response = item.toolResponse && typeof item.toolResponse === 'object' ? item.toolResponse : {};
  const artifacts = response.artifacts && typeof response.artifacts === 'object' ? response.artifacts : {};
  const data = response.data && typeof response.data === 'object' ? response.data : {};
  return artifacts.diff || data.diff || artifacts.unified_diff || '';
}

export function toolActionLabel(item) {
  const name = normalizeToolName(item.toolName);
  if (name === 'write_file') return 'Wrote';
  if (name === 'edit_file') return 'Edited';
  if (name === 'replace_lines') return 'Replaced lines';
  if (name === 'multi_edit') return 'Edited';
  if (name === 'apply_patch') return 'Patched';
  if (name === 'create_file') return 'Created';
  if (name === 'delete_file') return 'Deleted';
  if (name === 'copy_file') return 'Copied';
  if (name === 'create_dir') return 'Created dir';
  if (name === 'read_file') return 'Read';
  if (name === 'search_text') return 'Search text';
  if (name === 'glob_files') return 'Glob files';
  if (name === 'list_dir') return 'List dir';
  if (name === 'terminal') return 'Shell';
  if (name === 'start_background_process') return 'Start background process';
  if (name === 'read_background_process_output') return 'Read background output';
  if (name === 'stop_background_process') return 'Stop background process';
  if (name === 'background_process_status') return 'Background process status';
  if (name === 'list_background_processes') return 'List background processes';
  return item.label || item.toolName || 'Tool';
}

export function toolFailureActionLabel(item) {
  const name = normalizeToolName(item.toolName);
  if (name === 'write_file') return 'Write failed';
  if (name === 'edit_file') return 'Edit failed';
  if (name === 'replace_lines') return 'Replace lines failed';
  if (name === 'multi_edit') return 'Edit failed';
  if (name === 'apply_patch') return 'Apply patch failed';
  if (name === 'create_file') return 'Create failed';
  if (name === 'delete_file') return 'Delete failed';
  if (name === 'copy_file') return 'Copy failed';
  return `${toolActionLabel(item)} failed`;
}

export function extractProcessChatMeta(item, name) {
  const input = toolPlainObject(item.toolInput);
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
  };
}

export function buildToolView(item) {
  const name = normalizeToolName(item.toolName);
  const path = firstToolPath(item);
  if (isProcessTool(item, name)) {
    const output = toolDisplayOutput(item);
    const streamLines = buildToolStreamLines(item);
    const streamAnswerText = buildToolStreamAnswerText(item);
    const finalText = extractProcessResultText(item);
    const chatMeta = extractProcessChatMeta(item, name);
    return {
      mode: 'process',
      label: item.category === 'subagent'
        ? (item.label || item.toolName || 'Sub-agent')
        : (item.label || toolActionLabel(item)),
      requestJson: toolJsonText(item.toolInput),
      streamLines,
      streamAnswerText,
      progressEvents: Array.isArray(item.progressEvents) ? item.progressEvents : [],
      finalText,
      defaultOpen: false,
      task: chatMeta.task,
      role: chatMeta.role,
      systemPrompt: chatMeta.systemPrompt,
      mediaPath: chatMeta.mediaPath,
      visionMode: chatMeta.visionMode,
      isVision: chatMeta.isVision,
      isRunning: (item.status || '') === 'running',
    };
  }
  if (TOOL_DIFF_NAMES.has(name)) {
    const diff = getToolDiff(item);
    const { added, removed } = toolLineDelta(item, diff);
    const failed = isToolFailure(item);
    const target = path || item.label || name;
    if (failed) {
      const response = toolPlainObject(item.toolResponse);
      const error = toolPlainObject(response.error);
      const failureText = compactToolValue(error.message || response.summary || item.outputSummary || item.message, TOOL_BLOCK_LIMIT);
      const failureTarget = path ? ` ${path}` : '';
      return {
        mode: 'diff',
        label: `${toolFailureActionLabel(item)}${failureTarget}`,
        body: failureText || outputJsonText(item.toolResponse) || compactToolValue(item.toolOutput, TOOL_BLOCK_LIMIT),
      };
    }
    return {
      mode: 'diff',
      label: `${toolActionLabel(item)} ${target}${added || removed ? ` (+${added} -${removed})` : ' (no changes)'}`,
      body: diff ? compactToolText(diff) : '',
    };
  }
  if (TOOL_CHANGE_NAMES.has(name)) {
    const output = toolDisplayOutput(item);
    const jsonPayload = compactToolJsonPayload(
      item.toolInput || undefined,
      output,
    );
    return {
      mode: 'json',
      label: [toolActionLabel(item), path].filter(Boolean).join(' ') || item.label,
      requestJson: toolJsonText(item.toolInput),
      responseJson: outputJsonText(output),
      body: (jsonPayload.input || jsonPayload.output) ? stableJson(jsonPayload) : '',
    };
  }
  if (TOOL_READ_NAMES.has(name)) {
    return {
      mode: 'read',
      label: [toolActionLabel(item), path].filter(Boolean).join(' ') || item.label,
      body: '',
    };
  }
  if (TOOL_SHELL_NAMES.has(name)) {
    const response = toolPlainObject(item.toolResponse);
    const subject = toolPlainObject(response.subject);
    const artifacts = toolPlainObject(response.artifacts);
    const data = toolPlainObject(response.data);
    const diagnostics = toolPlainObject(artifacts.diagnostics);
    const error = toolPlainObject(response.error);
    const input = toolPlainObject(item.toolInput);
    const command = subject.command || input.command || input.cmd || '';
    const cwd = subject.cwd || input.working_dir || '';
    const output = extractTerminalOutput(item, response, artifacts, data);
    const stderr = firstToolDisplayValue(artifacts.stderr, data.stderr);
    const fallback = firstToolDisplayValue(error.message, response.summary, item.outputSummary);
    const exitCode = firstToolDisplayValue(error.exit_code, data.exit_code, diagnostics.exit_code);
    return {
      mode: 'terminal',
      label: command ? `${toolActionLabel(item)} ${command}` : toolActionLabel(item),
      command,
      cwd,
      requestJson: toolJsonText(item.toolInput),
      responseJson: outputJsonText(response),
      stdout: output || command ? (output ? tailToolOutput(output) : compactToolValue(fallback, 1200)) : '',
      stderr: stderr ? tailToolOutput(stderr) : '',
      exitCode,
      running: item.status === 'running' || item.status === 'pending',
      defaultOpen: false,
    };
  }
  const output = toolDisplayOutput(item);
  const jsonPayload = compactToolJsonPayload(
    item.toolInput || undefined,
    output,
  );
  return {
    mode: 'json',
    label: item.label || item.toolName || 'Tool',
    requestJson: toolJsonText(item.toolInput),
    responseJson: outputJsonText(output),
    body: (jsonPayload.input || jsonPayload.output) ? stableJson(jsonPayload) : '',
  };
}

export function ChatTimelineToolBody({ view }) {
  if (view.mode === 'terminal') {
    const hasTerminalContent = Boolean(view.command || view.stdout || view.stderr || view.running);
    return (
      <>
        {hasTerminalContent ? (
          <div className="chat-terminal-frame">
            <div className="chat-terminal-bar">
              <span className="chat-terminal-dots" aria-hidden="true"><span /><span /><span /></span>
              {view.cwd ? <span className="chat-terminal-cwd">{view.cwd}</span> : null}
              {view.running || (view.exitCode !== undefined && view.exitCode !== '') ? (
                <span className={`chat-terminal-state ${view.running ? 'running' : ''}`}>
                  {view.running ? 'running' : `exit ${view.exitCode}`}
                </span>
              ) : null}
            </div>
            {view.command ? (
              <div className="chat-terminal-command">
                <span className="chat-terminal-prompt">$</span>
                <span>{view.command}</span>
              </div>
            ) : null}
            {view.stdout ? <pre className="chat-terminal-output">{view.stdout}</pre> : null}
            {view.stderr ? <pre className="chat-terminal-output stderr">{view.stderr}</pre> : null}
            {view.running && !view.stdout && !view.stderr ? (
              <div className="chat-terminal-waiting">Waiting for output<span className="chat-terminal-cursor" aria-hidden="true" /></div>
            ) : null}
          </div>
        ) : null}
        {!hasTerminalContent ? <ChatJsonPair requestJson={view.requestJson} responseJson={view.responseJson} /> : null}
      </>
    );
  }
  if (view.mode === 'process') {
    return <ChatProcessConversation view={view} />;
  }
  if (view.mode === 'diff') {
    if (!view.body) return null;
    return (
      <pre className="chat-timeline-tool-code diff">
        {view.body.split('\n').map((line, index) => {
          const kind = line.startsWith('+') && !line.startsWith('+++')
            ? 'add'
            : line.startsWith('-') && !line.startsWith('---')
              ? 'remove'
              : line.startsWith('@@')
                ? 'hunk'
                : 'context';
          return <span key={index} className={`chat-tool-diff-line ${kind}`}>{line || ' '}</span>;
        })}
      </pre>
    );
  }
  if (view.mode === 'json') {
    return <ChatJsonPair requestJson={view.requestJson} responseJson={view.responseJson || view.body} />;
  }
  return null;
}

export const CHAT_TODO_COLLAPSED_COMPLETED_LIMIT = 2;

export function ChatTodoPanel({ todos = [], streaming = false }) {
  const safeTodos = Array.isArray(todos) ? todos : [];
  const [showAllCompleted, setShowAllCompleted] = React.useState(false);
  if (!safeTodos.length) return null;

  // 渲染顺序：in_progress 最前 → pending 居中 → completed 最后。
  // 不动原数组，按 status 分组聚合即可。
  const inProgress = safeTodos.filter((t) => t.status === 'in_progress');
  const pending = safeTodos.filter((t) => t.status === 'pending');
  const completed = safeTodos.filter((t) => t.status === 'completed');

  const visibleCompleted = showAllCompleted
    ? completed
    : completed.slice(-CHAT_TODO_COLLAPSED_COMPLETED_LIMIT);
  const hiddenCount = completed.length - visibleCompleted.length;

  return (
    <div className={`chat-todo-panel ${streaming ? 'streaming' : 'done'}`} role="list">
      {inProgress.map((todo, index) => (
        <ChatTodoRow key={`ip-${index}`} todo={todo} streaming={streaming} />
      ))}
      {pending.map((todo, index) => (
        <ChatTodoRow key={`pe-${index}`} todo={todo} streaming={streaming} />
      ))}
      {visibleCompleted.map((todo, index) => (
        <ChatTodoRow key={`co-${index}`} todo={todo} streaming={streaming} />
      ))}
      {hiddenCount > 0 ? (
        <button
          type="button"
          className="chat-todo-expand"
          onClick={() => setShowAllCompleted(true)}
        >
          … +{hiddenCount} completed
        </button>
      ) : null}
    </div>
  );
}

export function ChatTodoRow({ todo, streaming = false }) {
  const status = todo.status || 'pending';
  // 已完成、或本轮非 streaming 状态的 in_progress 项不要再继续转 spinner。
  // 只有"任务还在 running 时的 in_progress 项"才显示真正的旋转动画。
  const showLiveSpinner = status === 'in_progress' && streaming;
  return (
    <div className={`chat-todo-item status-${status}`} role="listitem">
      <ChatTodoStatusIcon status={status} live={showLiveSpinner} />
      <span className="chat-todo-content">{todo.content}</span>
    </div>
  );
}

export function ChatTodoStatusIcon({ status, live = false }) {
  if (status === 'completed') {
    return (
      <span className="chat-todo-icon completed" aria-label="completed">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3.5 8.5 L6.8 11.7 L12.5 5" />
        </svg>
      </span>
    );
  }
  if (status === 'in_progress') {
    return (
      <span className="chat-todo-icon in-progress" aria-label="in progress">
        <span className={`chat-todo-spinner ${live ? 'live' : ''}`} />
      </span>
    );
  }
  return <span className="chat-todo-icon pending" aria-label="pending" />;
}

export function ChatJsonBlock({ text, compact = false }) {
  if (!text) return null;
  return (
    <pre className={`chat-json-block ${compact ? 'compact' : ''}`}>
      {text}
    </pre>
  );
}

export function ChatJsonPair({ requestJson, responseJson }) {
  if (!requestJson && !responseJson) return null;
  const segments = [];
  if (requestJson) segments.push({ id: 'request', label: 'Request', text: requestJson });
  if (responseJson) segments.push({ id: 'response', label: 'Response', text: responseJson });
  const defaultId = responseJson ? 'response' : 'request';
  const [activeId, setActiveId] = React.useState(defaultId);
  const active = segments.find((seg) => seg.id === activeId) || segments[0];
  if (!active) return null;
  return (
    <div className="chat-json-card">
      {segments.length > 1 ? (
        <div className="chat-json-segments" role="tablist">
          {segments.map((seg) => (
            <button
              key={seg.id}
              type="button"
              role="tab"
              aria-selected={seg.id === active.id}
              className={`chat-json-segment ${seg.id === active.id ? 'is-active' : ''}`}
              onClick={() => setActiveId(seg.id)}
            >
              {seg.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="chat-json-card-head">
          <span className="chat-json-card-title">{active.label}</span>
        </div>
      )}
      <pre className="chat-json-card-body">{active.text}</pre>
    </div>
  );
}

export function chatProcessFileName(path) {
  if (!path) return '';
  const segments = String(path).split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] || path;
}

export function ChatImsgCollapsible({ children, maxHeight = 360 }) {
  const bodyRef = React.useRef(null);
  const [expanded, setExpanded] = React.useState(false);
  const [overflows, setOverflows] = React.useState(false);
  React.useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return undefined;
    const check = () => {
      const overflow = el.scrollHeight > el.clientHeight + 2;
      setOverflows((prev) => (prev === overflow ? prev : overflow));
    };
    check();
    const ro = (typeof ResizeObserver !== 'undefined') ? new ResizeObserver(check) : null;
    if (ro) ro.observe(el);
    return () => { if (ro) ro.disconnect(); };
  }, [children, expanded]);
  const showToggle = overflows || expanded;
  return (
    <div className={`chat-imsg-collapsible ${expanded ? 'is-expanded' : ''} ${overflows && !expanded ? 'is-collapsed' : ''}`}>
      <div
        ref={bodyRef}
        className="chat-imsg-collapsible-body"
        style={expanded ? null : { maxHeight: `${maxHeight}px` }}
      >
        {children}
      </div>
      {showToggle ? (
        <button
          type="button"
          className="chat-imsg-show-toggle"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Collapse' : 'View All'}
        </button>
      ) : null}
    </div>
  );
}

export function ChatProcessConversation({ view }) {
  const hasPrompt = Boolean(view.task || view.role || view.systemPrompt || view.mediaPath);
  const streamAnswerText = String(view.streamAnswerText || '');
  const hasStreamAnswer = Boolean(streamAnswerText.trim());
  const hasStream = Array.isArray(view.streamLines) && view.streamLines.length > 0;
  const subTimelineItems = buildSubAgentTimelineItems(view);
  const hasSubTimeline = subTimelineItems.length > 0;
  const hasFinal = Boolean(view.finalText);
  if (!hasPrompt && !hasSubTimeline && !hasStreamAnswer && !hasStream && !hasFinal && !view.requestJson) {
    return null;
  }
  const fileName = chatProcessFileName(view.mediaPath);
  const fields = [];
  if (view.role) fields.push({ label: 'Role', value: view.role });
  if (view.systemPrompt) fields.push({ label: 'System Prompt', value: view.systemPrompt, multiline: true, markdown: true });
  if (view.task) fields.push({ label: 'Task', value: view.task, multiline: true, markdown: true });
  const renderSubContent = () => {
    if (hasFinal) {
      const inner = view.isVision
        ? <div className="chat-imsg-plain">{view.finalText}</div>
        : <Markdown source={view.finalText} />;
      return <ChatImsgCollapsible maxHeight={360}>{inner}</ChatImsgCollapsible>;
    }
    if (hasSubTimeline) {
      return (
        <ChatImsgCollapsible maxHeight={420}>
          <div className="chat-imsg-subtimeline">
            <ChatAgentTimeline items={subTimelineItems} streaming={view.isRunning} />
          </div>
        </ChatImsgCollapsible>
      );
    }
    if (hasStreamAnswer || hasStream) {
      return (
        <ChatImsgCollapsible maxHeight={360}>
          {hasStreamAnswer ? (
            <div className="chat-imsg-stream-answer">
              <span className="chat-imsg-stream-answer-body">{streamAnswerText}</span>
              {view.isRunning ? <span className="chat-imsg-cursor" aria-hidden="true" /> : null}
            </div>
          ) : null}
          {hasStream ? (
            <div className="chat-imsg-stream-activity" aria-label="Sub-agent activity">
              {view.streamLines.map((row) => (
                <div key={row.id} className={`chat-imsg-stream-line ${row.state || ''}`}>
                  {row.text}
                </div>
              ))}
            </div>
          ) : null}
          {!hasStreamAnswer && view.isRunning ? <span className="chat-imsg-cursor" aria-hidden="true" /> : null}
        </ChatImsgCollapsible>
      );
    }
    return (
      <span className="chat-imsg-thinking">
        <span className="chat-imsg-dot" />
        <span className="chat-imsg-dot" />
        <span className="chat-imsg-dot" />
      </span>
    );
  };
  const showSub = hasSubTimeline || hasStreamAnswer || hasStream || hasFinal || view.isRunning;
  const subState = hasFinal ? 'final' : ((hasSubTimeline || hasStreamAnswer || hasStream) ? 'stream' : 'thinking');
  return (
    <div className="chat-imsg">
      {hasPrompt ? (
        <div className="chat-imsg-row from-main">
          <div className="chat-imsg-bubble main">
            {view.mediaPath ? (
              <div className="chat-imsg-attachment" title={view.mediaPath}>
                <span className="chat-imsg-attachment-icon ico ico-image-describe" aria-hidden="true" />
                <span className="chat-imsg-attachment-name">{fileName}</span>
                {view.visionMode ? (
                  <span className="chat-imsg-attachment-mode">{view.visionMode}</span>
                ) : null}
              </div>
            ) : null}
            {fields.length > 0 ? (
              <div className="chat-imsg-fields">
                {fields.map((field) => (
                  <div key={field.label} className={`chat-imsg-field ${field.multiline ? 'is-multiline' : ''}`}>
                    <div className="chat-imsg-field-label">{field.label}</div>
                    <div className={`chat-imsg-field-value ${field.markdown ? 'is-md' : ''}`}>
                      {field.markdown ? <Markdown source={String(field.value || '')} /> : field.value}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {showSub ? (
        <div className="chat-imsg-row from-sub">
          <div className={`chat-imsg-bubble sub ${subState} ${hasSubTimeline ? 'timeline' : ''}`}>
            {renderSubContent()}
          </div>
        </div>
      ) : null}

      {!hasPrompt && !showSub && view.requestJson ? (
        <ChatJsonBlock text={view.requestJson} compact />
      ) : null}
    </div>
  );
}

export function ChatTimelineToolNode({ item }) {
  const status = item.status || 'pending';
  const category = item.category || 'tool';
  const defaultIconClass = CATEGORY_ICON_CLASS[category] || CATEGORY_ICON_CLASS.tool;
  // 先按 toolName 匹配专属 icon；匹配不到再退回 skill/mcp/subagent 分类图标。
  const iconClass = resolveToolIconClass(item.toolName, defaultIconClass);
  const categoryLabel = CATEGORY_LABEL[category] || 'Tool';
  const view = buildToolView(item);
  const [open, setOpen] = React.useState(Boolean(view.defaultOpen));
  const fallbackLines = view.mode === 'read'
    ? []
    : [item.inputSummary, item.outputSummary].filter(Boolean).slice(0, 2);
  const hasChildren = Array.isArray(item.children) && item.children.length > 0;
  const hasBody = Boolean(view.body)
    || Boolean(view.command)
    || Boolean(view.stdout)
    || Boolean(view.stderr)
    || Boolean(view.requestJson)
    || Boolean(view.responseJson)
    || (Array.isArray(view.streamLines) && view.streamLines.length > 0)
    || Boolean(view.finalText)
    || fallbackLines.length > 0
    || hasChildren;
  return (
    <div className={`chat-timeline-tool category-${category} status-${status} mode-${view.mode}`}>
      <button
        type="button"
        className="chat-timeline-tool-head"
        onClick={() => hasBody && setOpen((value) => !value)}
        aria-expanded={open}
        disabled={!hasBody}
      >
        <span className={`chat-timeline-status status-${status}`} aria-hidden="true" />
        <span className={`ico ${iconClass}`} aria-label={categoryLabel} role="img" />
        <span className="chat-timeline-tool-name">{view.label}</span>
        {hasBody ? (
          <ChatTimelineChevron open={open} />
        ) : null}
      </button>
      {open && hasBody ? (
        <div className="chat-timeline-tool-body">
          {view.mode !== 'read' ? <ChatTimelineToolBody view={view} /> : null}
          {view.mode === 'read' && fallbackLines.map((line, index) => (
            <div key={index} className="chat-timeline-tool-line">{line}</div>
          ))}
          {hasChildren ? (
            <div className="chat-timeline-tool-children">
              {item.children.map((child) => (
                <ChatTimelineToolNode key={child.id} item={child} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// Collapsed view of a run of consecutive tool calls. Looks like a regular
// tool chip (same .chat-timeline-tool-head border / pill) but the label is a
// verb-counted summary like "read 3 files · executed 2 commands · used
// chrome devtools 11 tools". Click expands to the original per-tool chips.
export function ChatTimelineToolGroup({ item }) {
  const [open, setOpen] = React.useState(false);
  const status = item.status || 'done';
  const tools = Array.isArray(item.tools) ? item.tools : [];
  const summary = item.summary || `used ${tools.length} tools`;
  return (
    <div className={`chat-timeline-tool category-tool status-${status} is-group`}>
      <button
        type="button"
        className="chat-timeline-tool-head"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className={`chat-timeline-status status-${status}`} aria-hidden="true" />
        <span className="ico ico-tool" aria-label="Tools" role="img" />
        <span className="chat-timeline-tool-name">{summary}</span>
        <span className="chat-timeline-tool-group-count">{tools.length}</span>
        <ChatTimelineChevron open={open} />
      </button>
      {open ? (
        <div className="chat-timeline-tool-group-body">
          {tools.map((tool) => (
            <ChatTimelineToolNode key={tool.id} item={tool} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ChatTimelineMetaNode({ item }) {
  const isContextCompaction = String(item.summary || '').toLowerCase() === 'auto-compacting context';
  return (
    <div className={`chat-timeline-meta status-${item.status || 'done'} ${isContextCompaction ? 'is-compaction' : ''}`}>
      <button
        type="button"
        className="chat-timeline-meta-head"
        aria-expanded="false"
        disabled
      >
        <span className={`chat-timeline-status status-${item.status || 'done'}`} aria-hidden="true" />
        {isContextCompaction ? <span className="chat-timeline-compaction-icon" aria-hidden="true" /> : null}
        <span className="chat-timeline-meta-label">{item.summary || 'Thinking…'}</span>
      </button>
    </div>
  );
}

export function ChatTimelineThinkingNode({ item }) {
  const [open, setOpen] = React.useState(false);
  const text = String(item.text || '');
  const hasText = text.trim().length > 0;
  const charCount = text.length;
  return (
    <div className={`chat-timeline-thinking status-${item.status || 'done'} ${item.streaming ? 'streaming' : ''}`}>
      <button
        type="button"
        className="chat-timeline-thinking-head"
        onClick={() => hasText && setOpen((value) => !value)}
        aria-expanded={open}
        disabled={!hasText}
      >
        <span className={`chat-timeline-status status-${item.status || 'done'}`} aria-hidden="true" />
        <span className="ico ico-thinking" aria-label="Thinking" role="img" />
        {hasText ? (
          <span className="chat-timeline-thinking-count">{charCount} chars</span>
        ) : null}
        <ChatTimelineChevron open={open} />
      </button>
      {open && hasText ? (
        <div className="chat-timeline-thinking-body">{text}</div>
      ) : null}
    </div>
  );
}

export function ChatAgentTimeline({ items = [], streaming = false, latestTodos = null }) {
  const safeItems = Array.isArray(items) ? items : [];
  const todos = Array.isArray(latestTodos) && latestTodos.length > 0 ? latestTodos : null;
  // Empty timeline + done + no todos = nothing to show.
  // Empty timeline + streaming = activity indicator carries the "alive" hint.
  // Has todos = always show the panel even if there are no other items.
  if (!safeItems.length && !streaming && !todos) return null;
  return (
    <div className={`chat-timeline ${streaming ? 'streaming' : 'done'}`}>
      {safeItems.map((item) => {
        if (item.kind === 'text') {
          return (
            <div key={item.id} className={`chat-timeline-text ${item.streaming ? 'streaming' : ''}`}>
              <span className="chat-timeline-text-body">{item.text}</span>
              {item.streaming ? <span className="chat-timeline-text-cursor" aria-hidden="true" /> : null}
            </div>
          );
        }
        if (item.kind === 'tool') {
          return <ChatTimelineToolNode key={item.id} item={item} />;
        }
        if (item.kind === 'tool_group') {
          return <ChatTimelineToolGroup key={item.id} item={item} />;
        }
        if (item.kind === 'thinking') {
          return <ChatTimelineThinkingNode key={item.id} item={item} />;
        }
        if (item.kind === 'meta') {
          return <ChatTimelineMetaNode key={item.id} item={item} />;
        }
        return null;
      })}
      {streaming ? (
        <div className="chat-timeline-activity" aria-label="Agent activity">
          <span className="chat-timeline-spark" aria-hidden="true">*</span>
          <span className="chat-timeline-verb" aria-hidden="true" />
        </div>
      ) : null}
      {todos ? <ChatTodoPanel todos={todos} streaming={streaming} /> : null}
    </div>
  );
}

export function ChatTimelineCollapsed({ onExpand, label = 'Trace', expanded = false }) {
  return (
    <button type="button" className="chat-timeline-collapsed" onClick={onExpand}>
      <ChatTimelineChevron open={expanded} />
      <span className="chat-timeline-collapsed-text">{label}</span>
    </button>
  );
}

function FinalAnswerMarkdown({ source, streaming }) {
  const text = String(source || '');
  const previousStreamingRef = React.useRef(streaming);
  const [visibleText, setVisibleText] = React.useState(() => (streaming ? '' : text));
  const [revealing, setRevealing] = React.useState(false);

  React.useEffect(() => {
    const shouldReveal = previousStreamingRef.current && !streaming && Boolean(text);
    previousStreamingRef.current = streaming;

    if (streaming) {
      setVisibleText('');
      setRevealing(false);
      return undefined;
    }
    if (!shouldReveal || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setVisibleText(text);
      setRevealing(false);
      return undefined;
    }

    const characters = Array.from(text);
    const chunkSize = Math.max(1, Math.ceil(characters.length / 120));
    let visibleCount = 0;
    setVisibleText('');
    setRevealing(true);
    const timer = window.setInterval(() => {
      visibleCount = Math.min(visibleCount + chunkSize, characters.length);
      setVisibleText(characters.slice(0, visibleCount).join(''));
      if (visibleCount >= characters.length) {
        window.clearInterval(timer);
        setRevealing(false);
      }
    }, 24);
    return () => window.clearInterval(timer);
  }, [streaming, text]);

  if (!text || streaming) return null;
  return (
    <div className="chat-bubble-text">
      {Markdown ? <Markdown source={`${visibleText}${revealing ? ' ▍' : ''}`} /> : visibleText}
    </div>
  );
}

export function ChatMessageRow({ message, now, onPreviewImage }) {
  const timeline = Array.isArray(message.traceTimeline) ? message.traceTimeline : [];
  const hasTimeline = timeline.length > 0;
  const isAgent = message.role === 'agent';
  // While streaming: keep the timeline expanded so users see the live thinking + tools.
  // When the task is done: collapse it behind a one-liner; clicking reveals the trace.
  const [traceExpanded, setTraceExpanded] = React.useState(false);
  // Streaming 时即使 timeline 还没积累任何事件，也要渲染 ChatAgentTimeline，
  // 让黄色 `* Reasoning…` 活动指示器出来——否则刚发出消息那几百毫秒 bubble
  // 是完全空白的，用户以为前端卡了。
  const showTimelineExpanded = isAgent && (message.streaming || (hasTimeline && traceExpanded));
  const showTimelineCollapsed = isAgent && !message.streaming && hasTimeline;
  const isUser = message.role === 'user';
  const [copied, setCopied] = React.useState(false);
  const copyTimerRef = React.useRef(null);
  const nowMs = now instanceof Date ? now.getTime() : Number(now) || Date.now();
  const elapsed = isAgent
    ? formatElapsedDuration(message.createdAt, message.completedAt || (message.streaming ? nowMs : null))
    : '';
  const messageClock = formatMessageClock(isAgent ? (message.completedAt || message.createdAt) : message.createdAt);
  const timelineText = isAgent
    ? timeline.filter((item) => item.kind === 'text').map((item) => item.text || '').join('\n').trim()
    : '';
  const copyText = String(message.text || timelineText || '').trim();

  React.useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
  }, []);

  async function handleCopy() {
    if (!copyText) return;
    const ok = await copyTextToClipboard(copyText);
    if (!ok) return;
    setCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(false), 1200);
  }

  const messageImages = Array.isArray(message.images)
    ? message.images.filter((img) => img && (img.previewUrl || img.path))
    : [];

  return (
    <div className={`chat-message-row ${message.role}`}>
      {messageImages.length > 0 && (
        <div className="chat-message-images" aria-label="Attached images">
          {messageImages.map((img, idx) => (
            <div key={img.image_id || `${idx}`} className="chat-message-image">
              <button
                type="button"
                className="chat-message-image-button"
                onClick={() => onPreviewImage?.({
                  src: img.previewUrl || img.path,
                  title: img.name || img.path || 'Attached image',
                })}
                aria-label="Preview attached image"
              >
                {img.previewUrl ? (
                  <img src={img.previewUrl} alt="" draggable={false} />
                ) : (
                  <span className="chat-message-image-fallback" aria-hidden="true">▦</span>
                )}
              </button>
            </div>
          ))}
        </div>
      )}
      <div className={`chat-bubble ${message.status || ''}`}>
        <div className="chat-bubble-meta">
          <span className="chat-bubble-meta-main">
            <span
              className={`chat-bubble-avatar ${isUser ? 'ico-user-avatar' : 'ico-assistant-avatar'}`}
              aria-hidden="true"
            />
            <span>{isUser ? 'You' : 'Assistant'}</span>
          </span>
        </div>
        {showTimelineCollapsed ? (
          <>
            <ChatTimelineCollapsed
              onExpand={() => setTraceExpanded((value) => !value)}
              label={elapsed || 'Trace'}
              expanded={traceExpanded}
            />
            {traceExpanded ? (
              <ChatAgentTimeline
                items={timeline}
                streaming={false}
                latestTodos={message.traceLatestTodos || null}
              />
            ) : null}
          </>
        ) : null}
        {showTimelineExpanded && !showTimelineCollapsed ? (
          <ChatAgentTimeline
            items={timeline}
            streaming={message.streaming}
            latestTodos={message.traceLatestTodos || null}
          />
        ) : null}
        {isAgent ? (
          <FinalAnswerMarkdown source={message.text} streaming={message.streaming} />
        ) : message.text ? (
          <div className="chat-bubble-text"><span className="chat-stream-text">{message.text}</span></div>
        ) : null}
      </div>
      {(messageClock || copyText) ? (
        <div className="chat-message-actions">
          {messageClock ? <span className="chat-bubble-clock">{messageClock}</span> : null}
          {copyText ? (
            <PortalTooltip text={copied ? 'Copied' : 'Copy'} position="above">
              <button
                type="button"
                className={`chat-bubble-copy ${copied ? 'copied' : ''}`}
                onClick={handleCopy}
                aria-label={copied ? 'Copied' : 'Copy message'}
              >
                <span className="ico-copy-message" aria-hidden="true" />
              </button>
            </PortalTooltip>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ImagePreviewOverlay({ image, onClose }) {
  const [scale, setScale] = React.useState(1);
  const src = image?.src || '';
  const title = image?.title || 'image';

  React.useEffect(() => {
    if (!image) return undefined;
    setScale(1);
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [image, onClose]);

  if (!image || !src) return null;

  function adjustScale(delta) {
    setScale((value) => Math.max(0.25, Math.min(3, Number((value + delta).toFixed(2)))));
  }

  function downloadImage() {
    const link = document.createElement('a');
    link.href = src;
    link.download = String(title).split('/').pop() || 'image';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  return (
    <div
      className="image-preview-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div className="image-preview-toolbar" aria-label="Image preview actions">
        <button type="button" className="image-preview-action" onClick={downloadImage} aria-label="Download image">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3v10" />
            <path d="m7 9 5 5 5-5" />
            <path d="M5 20h14" />
          </svg>
        </button>
        <button type="button" className="image-preview-action image-preview-close" onClick={onClose} aria-label="Close preview">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>
      <div className="image-preview-stage">
        <img
          src={src}
          alt=""
          draggable={false}
          style={{ transform: `scale(${scale})` }}
        />
      </div>
      <div className="image-preview-zoom" aria-label="Image zoom controls">
        <button type="button" onClick={() => adjustScale(-0.1)} aria-label="Zoom out">-</button>
        <span>{Math.round(scale * 100)}%</span>
        <button type="button" onClick={() => adjustScale(0.1)} aria-label="Zoom in">+</button>
      </div>
    </div>
  );
}

export const CHAT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const CHAT_IMAGE_MAX_COUNT = 4;
export const CHAT_IMAGE_ACCEPTED_MIME = new Set([
  'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif',
]);

export function ChatPanel({
  conversationId,
  messages = [],
  running = false,
  disabled = false,
  submitPending = false,
  onSend,
  onStop,
  onSelectFile,
  onClearFile,
  onUploadImage,
  attachment,
  uploading,
  contextUsage,
  workspacePath,
  homePath,
  activeTaskText,
  now,
  providerOptions = [],
  modelOptions,
  defaultModelId,
  modelLoading = false,
  agentOptions,
  defaultAgentId,
  agentLoading = false,
  agentLocked = false,
  agentLockedReason = '',
  lockedAgentId = '',
  selectionStorageKey = '',
}) {
  const resolvedOptions = Array.isArray(modelOptions) ? modelOptions : MODEL_OPTIONS;
  const resolvedDefaultModelId = defaultModelId || resolvedOptions[0]?.id || 'gpt-5.5';
  const resolvedProviderOptions = Array.isArray(providerOptions) && providerOptions.length > 0
    ? providerOptions
    : [];
  const resolvedAgentOptions = Array.isArray(agentOptions) && agentOptions.length > 0 ? agentOptions : DEFAULT_AGENT_OPTIONS;
  const resolvedDefaultAgentId = defaultAgentId || resolvedAgentOptions[0]?.id || DEFAULT_AGENT_OPTIONS[0].id;
  const [draft, setDraft] = React.useState('');
  const { providerId, setProviderId, modelId, setModelId, agentId, setAgentId, reasoningEffort, setReasoningEffort } = usePersistentRunConfig({
    selectionStorageKey,
    providerOptions: resolvedProviderOptions,
    modelOptions: resolvedOptions,
    defaultModelId: resolvedDefaultModelId,
    agentOptions: resolvedAgentOptions,
    defaultAgentId: resolvedDefaultAgentId,
  });
  const [composerImages, setComposerImages] = React.useState([]);
  const [previewImage, setPreviewImage] = React.useState(null);
  const closeImagePreview = React.useCallback(() => setPreviewImage(null), []);
  const composerImagesRef = React.useRef([]);
  React.useEffect(() => { composerImagesRef.current = composerImages; }, [composerImages]);
  const effectiveAgentId = agentLocked && lockedAgentId ? lockedAgentId : agentId;
  const currentSelection = resolvedAgentOptions.find((item) => item.id === effectiveAgentId);
  const canUploadDocuments = currentSelection?.canUploadDocuments === true;
  const currentProvider = resolvedProviderOptions.find((item) => item.id === providerId) || resolvedProviderOptions[0];
  const activeModelOptions = modelsForRunProvider(currentProvider, resolvedOptions);
  const providerRequest = currentProvider?.requestProvider || currentProvider?.provider || providerId || '';
  const providerConfigured = Boolean(currentProvider && providerRequest);

  // Clean up blob URLs + reset draft images when switching conversations.
  React.useEffect(() => {
    return () => {
      composerImagesRef.current.forEach((img) => {
        if (img.previewUrl) URL.revokeObjectURL(img.previewUrl);
      });
    };
  }, [conversationId]);
  React.useEffect(() => {
    setComposerImages([]);
  }, [conversationId]);

  async function attachImageFile(file) {
    if (!file) return;
    if (!CHAT_IMAGE_ACCEPTED_MIME.has((file.type || '').toLowerCase())) {
      console.warn('Unsupported image type', file.type);
      return;
    }
    if (file.size > CHAT_IMAGE_MAX_BYTES) {
      const draft = {
        id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        previewUrl: '',
        uploading: false,
        error: `File too large (>${Math.round(CHAT_IMAGE_MAX_BYTES / 1024 / 1024)}MB)`,
      };
      setComposerImages((prev) => [...prev, draft]);
      return;
    }
    if (composerImagesRef.current.length >= CHAT_IMAGE_MAX_COUNT) {
      console.warn(`Image limit reached (${CHAT_IMAGE_MAX_COUNT})`);
      return;
    }

    const id = `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const previewUrl = URL.createObjectURL(file);
    setComposerImages((prev) => [...prev, { id, file, previewUrl, uploading: true }]);

    try {
      const result = await onUploadImage?.(file);
      if (!result || !result.image_id) {
        throw new Error('Upload response missing image_id');
      }
      setComposerImages((prev) => prev.map((img) =>
        img.id === id
          ? { ...img, uploading: false, imageId: result.image_id, path: result.path, mime: result.mime, sizeBytes: result.size_bytes }
          : img,
      ));
    } catch (error) {
      console.error('Chat image upload failed', error);
      setComposerImages((prev) => prev.map((img) =>
        img.id === id ? { ...img, uploading: false, error: String(error?.message || error) } : img,
      ));
    }
  }

  function removeComposerImage(id) {
    setComposerImages((prev) => {
      const target = prev.find((img) => img.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((img) => img.id !== id);
    });
  }

  function handleComposerPaste(event) {
    const items = Array.from(event.clipboardData?.items || []);
    const imageFiles = items
      .filter((it) => it.kind === 'file' && (it.type || '').toLowerCase().startsWith('image/'))
      .map((it) => it.getAsFile())
      .filter(Boolean);

    if (imageFiles.length === 0) {
      // Fall through to existing path-paste behavior.
      handlePathPaste(event, draft, setDraft, workspacePath, homePath, 5000);
      return;
    }
    event.preventDefault();
    imageFiles.forEach((file) => attachImageFile(file));
  }

  function handleComposerDrop(event) {
    const files = Array.from(event.dataTransfer?.files || [])
      .filter((file) => (file.type || '').toLowerCase().startsWith('image/'));
    if (!files.length) return;
    event.preventDefault();
    files.forEach((file) => attachImageFile(file));
  }

  function handleComposerDragOver(event) {
    if (Array.from(event.dataTransfer?.items || []).some((it) => it.kind === 'file')) {
      event.preventDefault();
    }
  }

  const imagesUploading = composerImages.some((img) => img.uploading);
  const openImagePreview = React.useCallback((image) => {
    const src = image?.src || image?.previewUrl || image?.path || '';
    if (!src) return;
    setPreviewImage({
      src,
      title: image?.title || image?.name || image?.path || 'image',
    });
  }, []);

  const listRef = React.useRef(null);
  const inputRef = React.useRef(null);
  const fileRef = React.useRef(null);
  const suppressSubmitUntilRef = React.useRef(0);
  const shouldAutoScrollRef = React.useRef(true);
  const lastMessageCountRef = React.useRef(messages.length);
  const lastConversationIdRef = React.useRef(conversationId || null);
  const usedTokens = Math.max(0, Math.round(Number(contextUsage?.usedTokens) || 0));
  const totalTokens = Math.max(1, Math.round(Number(contextUsage?.totalTokens) || 128000));
  const contextRatio = Math.max(0, Math.min(1, Number(contextUsage?.ratio) || (usedTokens / totalTokens)));
  const visibleContextRatio = usedTokens > 0 ? Math.max(contextRatio, 0.01) : 0;
  const contextTooltip = `${formatContextUsageLabel(usedTokens, totalTokens)}${contextUsage?.overLimit ? ' · Over limit' : ''}`;
  const contextRingStyle = {
    '--context-used': `${visibleContextRatio * 100}%`,
  };

  function isMessageListNearBottom(el) {
    return el.scrollHeight - el.scrollTop - el.clientHeight <= 48;
  }

  function handleMessageListScroll(event) {
    shouldAutoScrollRef.current = isMessageListNearBottom(event.currentTarget);
  }

  React.useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const normalizedConversationId = conversationId || null;
    if (normalizedConversationId !== lastConversationIdRef.current || messages.length < lastMessageCountRef.current) {
      shouldAutoScrollRef.current = true;
    }
    lastConversationIdRef.current = normalizedConversationId;
    lastMessageCountRef.current = messages.length;
    if (!shouldAutoScrollRef.current) return;
    requestAnimationFrame(() => {
      if (listRef.current) {
        listRef.current.scrollTop = listRef.current.scrollHeight;
      }
    });
  }, [conversationId, messages, running]);

  React.useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, [draft]);

  function restoreActiveTaskText() {
    const text = String(activeTaskText || '').trim();
    if (!text) return;
    setDraft(text);
    requestAnimationFrame(() => {
      inputRef.current?.focus?.();
      inputRef.current?.setSelectionRange?.(text.length, text.length);
    });
  }

  function stopAndRestore() {
    onStop?.();
    restoreActiveTaskText();
  }

  function handleStopPress(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    suppressSubmitUntilRef.current = Date.now() + 700;
    stopAndRestore();
  }

  function handleStopKey(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    handleStopPress(event);
  }

  React.useEffect(() => {
    if (!running && !submitPending) return undefined;
    function handleEscape(event) {
      if (event.key !== 'Escape' || event.isComposing) return;
      event.preventDefault();
      stopAndRestore();
    }
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [running, submitPending, activeTaskText, onStop]);

  function submit(e) {
    e?.preventDefault();
    if (Date.now() < suppressSubmitUntilRef.current) return;
    const text = draft.trim();
    if (!text || disabled || submitPending || !providerConfigured) return;
    // Block while any pasted image is still uploading.
    if (imagesUploading) return;
    if (modelLoading || !activeModelOptions.some((o) => o.id === modelId)) return;
    if (!resolvedAgentOptions.some((o) => o.id === effectiveAgentId)) return;
    const readyImages = composerImages
      .filter((img) => img.imageId && !img.error)
      .map((img) => ({
        image_id: img.imageId,
        path: img.path,
        mime: img.mime,
        previewUrl: img.previewUrl || null,
      }));
    onSend?.(text, attachment, modelId, reasoningEffort, readyImages, effectiveAgentId, providerRequest);
    setDraft('');
    onClearFile?.();
    // Ownership of the blob URLs transfers to the rendered chat message; the
    // unmount cleanup at the conversationId boundary will revoke them. Do NOT
    // revoke here, or the just-sent thumbnail goes blank.
    setComposerImages([]);
    if (fileRef.current) fileRef.current.value = '';
  }

  function pickFile() {
    if (!canUploadDocuments || disabled || submitPending) return;
    fileRef.current?.click();
  }

  function clearFile(e) {
    e.stopPropagation();
    onClearFile?.();
    if (fileRef.current) fileRef.current.value = '';
  }

  React.useEffect(() => {
    if (!canUploadDocuments && attachment) onClearFile?.();
  }, [canUploadDocuments, attachment, onClearFile]);

  return (
    <section className="chat-workspace" aria-label="Chat">
      <div ref={listRef} className="chat-message-list" onScroll={handleMessageListScroll}>
        {messages.length === 0 ? (
          <div className="chat-empty">
            <div className="chat-empty-illustration" aria-hidden="true">
              <div className="chat-empty-card chat-empty-card-primary">
                <img src="/assets/ui/empty-state/penguin-relax-card.png" alt="" />
              </div>
              <div className="chat-empty-card chat-empty-card-secondary">
                <img src="/assets/ui/empty-state/penguin-sleepy-card.png" alt="" />
              </div>
            </div>
            <div className="chat-empty-title">What's on your mind?</div>
            <div className="chat-empty-copy">Drop a task, a question, or a loose idea. I'll take it from there.</div>
          </div>
        ) : messages.map((message) => (
          <ChatMessageRow key={message.id} message={message} now={now} onPreviewImage={openImagePreview} />
        ))}
      </div>
      <form
        className="chat-composer"
        onSubmit={submit}
        onDragOver={handleComposerDragOver}
        onDrop={handleComposerDrop}
      >
        {(composerImages.length > 0 || attachment) && (
          <div className="chat-composer-attachments" aria-label="Attachments">
            {attachment && (
              <AttachmentFileChip attachment={attachment} uploading={uploading} onClear={clearFile} />
            )}
            {composerImages.length > 0 && (
              <div className="chat-composer-images" aria-label="Pasted images">
                {composerImages.map((img) => (
                  <PortalTooltip
                    key={img.id}
                    text={img.error || (img.uploading ? 'Uploading...' : (img.file?.name || 'image'))}
                    position="above"
                  >
                    <div
                      className={`chat-composer-image-chip ${img.uploading ? 'is-uploading' : ''} ${img.error ? 'has-error' : ''}`}
                    >
                      <button
                        type="button"
                        className="chat-composer-image-preview-button"
                        onClick={() => openImagePreview({
                          src: img.previewUrl || img.path,
                          title: img.file?.name || img.path || 'Pasted image',
                        })}
                        disabled={!img.previewUrl && !img.path}
                        aria-label="Preview pasted image"
                      >
                        {img.previewUrl ? (
                          <img src={img.previewUrl} alt="" draggable={false} />
                        ) : (
                          <span className="chat-composer-image-fallback" aria-hidden="true">!</span>
                        )}
                      </button>
                      {img.uploading && <span className="chat-composer-image-spinner" aria-hidden="true" />}
                      <button
                        type="button"
                        className="chat-composer-image-remove"
                        onClick={() => removeComposerImage(img.id)}
                        aria-label="Remove image"
                      >×</button>
                    </div>
                  </PortalTooltip>
                ))}
              </div>
            )}
          </div>
        )}
        <textarea
          ref={inputRef}
          rows={1}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onPaste={handleComposerPaste}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && running && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.stopPropagation();
              stopAndRestore();
              return;
            }
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit(event);
            }
          }}
          placeholder={!providerConfigured ? 'Configure an LLM provider in Settings first...' : submitPending ? 'Preparing conversation...' : running ? 'Assistant is currently processing...' : 'Ask, draft, or delegate...'}
          disabled={disabled}
          maxLength={5000}
        />
        <div className="chat-composer-actions">
          <div className="chat-composer-tools">
            {canUploadDocuments ? (
              <>
                <PortalTooltip text="Attach File" position="above">
                  <button
                    type="button"
                    className="chat-tool-btn chat-tool-attach icon-only"
                    onClick={pickFile}
                    disabled={disabled || submitPending}
                    aria-label="Attach File"
                  >
                    <span className="ico ico-attach" aria-hidden="true" />
                  </button>
                </PortalTooltip>
                <input
                  ref={fileRef}
                  type="file"
                  className="td-file-input"
                  onChange={e => {
                    const nextFile = e.target.files?.[0] || null;
                    if (!nextFile) return;
                    onSelectFile?.(nextFile);
                  }}
                />
              </>
            ) : null}
            <ApprovalModePicker />
          </div>
          <div className="chat-composer-submit">
            <PortalTooltip text={contextTooltip} position="above">
              <button
                type="button"
                className={`context-usage-btn icon-only ${contextUsage?.compressed ? 'compressed' : ''} ${contextUsage?.overLimit ? 'over-limit' : ''}`}
                aria-label={contextTooltip}
                aria-disabled="true"
              >
                <span className="context-usage-icon" style={contextRingStyle} aria-hidden="true" />
              </button>
            </PortalTooltip>
            <ModelPicker
              value={modelId}
              reasoningEffort={reasoningEffort}
              options={activeModelOptions}
              onChange={setModelId}
              onReasoningChange={setReasoningEffort}
              disabled={disabled || submitPending}
              loading={modelLoading}
              providerValue={providerId}
              providerOptions={resolvedProviderOptions}
              onProviderChange={setProviderId}
              agentValue={effectiveAgentId}
              agentOptions={resolvedAgentOptions}
              onAgentChange={setAgentId}
              agentLoading={agentLoading}
              agentLocked={agentLocked}
              agentLockedReason={agentLockedReason}
            />
            {submitPending || running ? (
              <button type="button" className="chat-send stop" onMouseDown={handleStopPress} onKeyDown={handleStopKey} aria-label={submitPending ? 'Cancel pending request' : 'Stop'}>
                <span className="ico ico-stop" aria-hidden="true" />
              </button>
            ) : (
              <button type="submit" className="chat-send" disabled={disabled || !draft.trim() || !providerConfigured} aria-label="Send">
                <span className="ico ico-deploy" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </form>
      <ImagePreviewOverlay image={previewImage} onClose={closeImagePreview} />
    </section>
  );
}
