// 工具视图的共用底座：文本压缩、JSON 清洗、失败判定与标签文案。
// 各工具类型（terminal / file / search / agent）都从这里取同一套原语。
import { normalizeToolName } from '../tool-names.js';

export const TOOL_BLOCK_LIMIT = 16000;
const TOOL_SHELL_TAIL_LINES = 80;
const TOOL_SHELL_TAIL_CHARS = 8192;
const TOOL_JSON_STRING_LIMIT = 2000;
const TOOL_JSON_ARRAY_LIMIT = 20;
const TOOL_JSON_DEPTH_LIMIT = 4;
const TOOL_SUMMARY_VALUE_LIMIT = 420;
const TOOL_JSON_OMIT_KEYS = new Set([
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
const TOOL_ARTIFACT_KEEP_KEYS = new Set([
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

function truncateToolString(value, limit = TOOL_JSON_STRING_LIMIT) {
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

function sanitizeToolJson(value, depth = 0, keyName = '') {
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

function isEmptyToolJsonValue(value) {
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

export function toolDisplayOutput(item) {
  if (item.toolResponse) return item.toolResponse;
  if (isRawToolResponseText(item.toolOutput)) return item.outputSummary || undefined;
  return item.toolOutput || item.outputSummary || undefined;
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
  if (name === 'exec_command') return 'Shell';
  if (name === 'write_stdin') return 'Process';
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

// 认不出类型的工具落到通用 JSON 卡：请求体 + 响应体，两段都按同一套规则清洗。
export function buildJsonToolView(item) {
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
