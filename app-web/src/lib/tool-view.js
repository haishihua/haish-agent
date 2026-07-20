// @haish-esm
import { normalizeToolName } from './tool-names.js';

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
