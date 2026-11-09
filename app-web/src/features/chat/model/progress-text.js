// 进度行与流式文本累积：任务流、恢复与重放共用同一套拼接规则。

export function getChatProgressLine(event) {
  const toolName = event.tool_name || event.toolName || 'tool';
  const message = String(event.message || '').trim();
  switch (event.type) {
    case 'run_started':
      return '';
    case 'provider_selected':
      return `Model selected: ${event.provider || event.provider_key || 'auto'}.`;
    case 'context_compaction_started':
      return 'Auto-Compacting context';
    case 'context_compaction_completed':
      return 'Auto-Compacting context';
    case 'context_compaction_failed':
      return 'Context compaction failed.';
    case 'llm_thinking_started':
      return 'Assistant is reasoning.';
    case 'llm_thinking_completed':
      return 'Reasoning step complete.';
    case 'tool_call_started':
      return `Running ${toolName}.`;
    case 'tool_call_completed':
      return `${toolName} completed.`;
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

export function llmRetrySummary(event) {
  const state = String(event?.retryState || '');
  const reason = String(event?.reason || 'transient_error');
  const attempt = Math.max(Number(event?.attempt || 1), 1);
  const maxAttempts = Math.max(Number(event?.maxAttempts || 1), 1);
  if (reason === 'output_truncated') {
    if (state === 'recovered') return 'Response continuation completed';
    if (state === 'exhausted') return 'Response incomplete · partial output preserved';
    return 'Output limit reached · continuing response';
  }
  const copy = {
    connection_error: ['Connection interrupted', 'Connection restored', 'Connection failed'],
    tls_error: ['Connection interrupted', 'Connection restored', 'Connection failed'],
    timeout: ['Model response timed out', 'Model response resumed', 'Model response failed'],
    rate_limited: ['Too many requests', 'Request accepted', 'Request limit persisted'],
    service_unavailable: ['Model service unavailable', 'Model service restored', 'Model service unavailable'],
    incomplete_stream: ['Model response interrupted', 'Model response resumed', 'Model response failed'],
    transient_error: ['Model request interrupted', 'Model request restored', 'Model request failed'],
  }[reason] || ['Model request interrupted', 'Model request restored', 'Model request failed'];
  if (state === 'recovered') return `${copy[1]} on attempt ${attempt}/${maxAttempts}`;
  if (state === 'exhausted') return `${copy[2]} after ${attempt} attempts`;
  return `${copy[0]} · retrying ${attempt}/${maxAttempts}`;
}
