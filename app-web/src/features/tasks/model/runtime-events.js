import { stripChatImageAugmentation, eventDeltaText } from '../../chat/model/chat-text.js';
export const STREAM_EVENT_BATCH_MS = 32;

export const CHAT_FINAL_FOLLOWUP_EVENT_TYPES = new Set([
  'context_compaction_started',
  'context_compaction_completed',
  'context_compaction_failed',
  'context_usage_updated',
  'run_finished',
]);

export const STREAM_IMMEDIATE_EVENT_TYPES = new Set([
  'context_compaction_started',
  'context_compaction_completed',
  'context_compaction_failed',
  'llm_text_phase_resolved',
  'llm_retry',
  'task_input_queued',
  'task_input_applied',
  'tool_call_started',
  'tool_call_completed',
  'todo_updated',
  'sub_agent_tool_call_started',
  'sub_agent_tool_call_completed',
  'sub_agent_started',
  'sub_agent_finished',
  'final_answer',
  'run_finished',
]);

export function defaultQuestDescription(text) {
  const displayText = stripChatImageAugmentation(text).text;
  return displayText ? `Triggered by user input: ${displayText}` : 'Triggered by user input.';
}


export function toDisplayText(value) {
  if (value == null) return '';
  if (typeof value === 'string') {
    const text = value.trim();
    if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'))) {
      try {
        return toDisplayText(JSON.parse(text));
      } catch {
        return value;
      }
    }
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value.map((item) => toDisplayText(item)).filter(Boolean).join('\n');
  }
  if (typeof value === 'object') {
    for (const key of ['answer', 'summary', 'text', 'content', 'message', 'output', 'result']) {
      if (value[key] != null) {
        const displayText = toDisplayText(value[key]);
        if (displayText) return displayText;
      }
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export function finalWorkflowResultText(task, fallback = '') {
  const nodeTypes = new Map(
    (task?.workflowSnapshot?.nodes || []).map((node) => [String(node?.id || ''), String(node?.type || '')]),
  );
  const nodeResult = Object.entries(task?.workflowRun?.nodes || {})
    .reverse()
    .find(([nodeId, node]) => {
      const nodeType = nodeTypes.get(nodeId) || (nodeId === 'start' || nodeId === 'output' ? nodeId : '');
      return !['start', 'output', 'condition'].includes(nodeType)
        && toDisplayText(node?.summary ?? node?.text ?? node?.output).trim();
    });
  if (nodeResult) {
    const node = nodeResult[1];
    return toDisplayText(node?.summary ?? node?.text ?? node?.output).trim();
  }
  return toDisplayText(fallback || task?.answerText || task?.error).trim();
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

export function normalizeRuntimeEvent(raw) {
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
    type: rawType,
    event_id: raw.event_id || payload.event_id || null,
    task_id: raw.task_id || payload.task_id || null,
    conversation_id: raw.conversation_id || payload.conversation_id || null,
    loop_index: Number.isFinite(loopIndex) ? loopIndex : 0,
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

export function normalizeRuntimeEvents(events) {
  if (!Array.isArray(events)) return [];
  return events
    .map((event) => normalizeRuntimeEvent(event))
    .filter(Boolean);
}

export function runtimeEventToLog(event) {
  const deltaText = eventDeltaText(event);
  return {
    type: event.type,
    eventId: event.event_id || null,
    timestamp: event.timestamp,
    callId: event.call_id || null,
    parentCallId: event.parent_call_id || event.parentCallId || null,
    toolName: event.tool_name || null,
    toolGroup: event.tool_group || null,
    kind: event.kind || null,
    role: event.role || event.sub_agent_role || null,
    inputSummary: event.input_summary || '',
    outputSummary: event.output_summary || '',
    toolInput: event.tool_input || null,
    toolResponse: event.tool_response || null,
    toolOutput: event.tool_output || '',
    skillName: event.skill_name || '',
    skillPath: event.skill_path || '',
    provider: event.provider || null,
    providerKey: event.provider_key || null,
    workflowNodeId: event.workflow_node_id || null,
    workflowNodeType: event.node_type || null,
    nodeInput: event.input ?? event.node_input ?? null,
    waitType: event.wait_type || null,
    fromNodeId: event.from_node_id || event.fromNodeId || null,
    toNodeId: event.to_node_id || event.toNodeId || null,
    summary: event.summary ?? '',
    compactionSummary: event.summary_text ?? '',
    summaryTokens: event.summary_tokens ?? null,
    compactedMessageCount: event.message_count ?? null,
    promptTokensBeforeCompaction: event.prompt_tokens_before_compaction ?? null,
    promptTokensAfterCompaction: event.prompt_tokens_after_compaction ?? null,
    error: event.error ?? '',
    decision: event.decision ?? '',
    feedback: event.feedback ?? '',
    value: event.value ?? null,
    json: event.json ?? null,
    text: event.text ?? '',
    inputId: event.input_id || event.inputId || null,
    inputs: Array.isArray(event.inputs) ? event.inputs : [],
    imageAttachments: Array.isArray(event.image_attachments) ? event.image_attachments : [],
    status: event.status || null,
    model: event.model || null,
    reason: event.reason || '',
    operationId: event.operation_id || null,
    retryState: event.state || null,
    attempt: Number(event.attempt || 0),
    maxAttempts: Number(event.max_attempts || 0),
    discardedOutput: Boolean(event.discarded_output),
    errorMessage: event.error_message || event.errorMessage || '',
    usedTokens: event.used_tokens || null,
    totalTokens: event.total_tokens || null,
    selectedToolCount: event.selected_tool_count || null,
    estimatedTokens: event.estimated_tokens || null,
    todoItems: Array.isArray(event.items) ? event.items : [],
    todoCounts: event.counts && typeof event.counts === 'object' ? event.counts : null,
    todoWriteCount: Number(event.write_count || 0),
    compressed: Boolean(event.compressed),
    delta: deltaText,
    textBlockId: event.text_block_id || event.textBlockId || null,
    messagePhase: event.message_phase || event.messagePhase || null,
    message: toDisplayText(event.message || deltaText || event.content || null),
    loopIndex: event.loop_index || 0,
  };
}

export function getLoopIndexFromEvents(events) {
  return events.reduce((max, event) => Math.max(max, event.loop_index || 0), 0);
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
  const labels = {
    generic: 'Auto',
    anthropic: 'Anthropic protocol',
    gemini: 'Gemini',
    xai: 'xAI protocol',
  };
  for (const source of sources) {
    if (!source) continue;
    const providerKey = normalizeProviderKey(source.provider_key || source.providerKey || source.requestedProvider);
    if (providerKey) return { key: providerKey, label: labels[providerKey] || 'OpenAI protocol' };
    const modelKey = normalizeProviderKey(source.model);
    if (modelKey) return { key: modelKey, label: labels[modelKey] || 'OpenAI protocol' };
    const providerNameKey = normalizeProviderKey(source.provider);
    if (providerNameKey) return { key: providerNameKey, label: labels[providerNameKey] || 'OpenAI protocol' };
  }
  return { key: 'generic', label: 'Auto' };
}
