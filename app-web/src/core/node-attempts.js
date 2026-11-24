// 节点执行记录的纯投影：一次尝试里的事件、输入与结果文本。UI 无关。
import {
  mergeWorkflowNodeAttempts,
  workflowToolCallsForAttempt,
} from './runtime-workflow-layout.js';
import { workflowArgumentsText } from './workflow-catalog.js';
import { GOAL_WORKFLOW_ID } from './workflow-ids.js';
import { recordStreamEventUpdate, streamEventUpdate } from './stream-events.js';

// 工作流事件里的节点 id：四种字段名都能出现（camel/snake × workflowNode/node）。
// 事件订阅方与尝试投影都读这一份，字段别名加一处就够了。
export function judgeReasonText(result) {
  if (result?.error) return detailText(result.error);
  const raw = result?.summary || result?.text || result?.output;
  let structured = result?.json || result?.structured;
  if (typeof structured?.reason !== 'string' && typeof raw === 'string') {
    try { structured = JSON.parse(raw.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')); } catch { /* Keep malformed output visible for diagnosis. */ }
  }
  const reason = typeof structured?.reason === 'string' ? structured.reason : detailText(raw);
  // Older verdicts are a single wall of text. Preserve every character and
  // only add paragraph breaks after Chinese sentence endings outside code.
  if (reason.length < 240 || reason.includes('\n') || reason.includes('`')) return reason;
  return reason.replace(/([。！？])(?=\S)/g, '$1\n\n');
}

export function eventNodeId(event) {
  return String(event?.workflowNodeId || event?.workflow_node_id || event?.nodeId || event?.node_id || '');
}

const attemptProjectionCache = new WeakMap();
const EMPTY_ATTEMPT_EVENTS = [];

export function nodeAttempts(task, nodeId) {
  const events = Array.isArray(task?.eventLog) ? task.eventLog : EMPTY_ATTEMPT_EVENTS;
  const result = task?.workflowRun?.nodes?.[nodeId] || null;
  const persisted = task?.workflowRun?.node_attempts?.[nodeId];
  const cacheKey = events === EMPTY_ATTEMPT_EVENTS ? (task || events) : events;
  let byNode = attemptProjectionCache.get(cacheKey);
  if (!byNode) { byNode = new Map(); attemptProjectionCache.set(cacheKey, byNode); }
  const cached = byNode.get(nodeId);
  if (cached && cached.result === result && cached.persisted === persisted) return cached.value;
  const update = streamEventUpdate(events);
  const previous = update?.previous.deref();
  const base = previous && attemptProjectionCache.get(previous)?.get(nodeId);
  const tail = events.at(-1);
  const lastAttempt = base?.value.at(-1);
  const canUpdateTail = base && base.result === result && base.persisted === persisted
    && previous.length === events.length && update.prefixLength === events.length - 1
    && ['llm_answer_delta', 'llm_thinking_delta'].includes(tail?.type)
    && previous.at(-1)?.type === tail.type
    && eventNodeId(previous.at(-1)) === eventNodeId(tail)
    && lastAttempt?.events.at(-1) === previous.at(-1);
  const value = canUpdateTail
    ? [...base.value.slice(0, -1), { ...lastAttempt, events: recordStreamEventUpdate(
      [...lastAttempt.events.slice(0, -1), tail], lastAttempt.events, lastAttempt.events.length - 1,
    ) }]
    : projectNodeAttempts(task, nodeId);
  byNode.set(nodeId, { result, persisted, value });
  return value;
}

function projectNodeAttempts(task, nodeId) {
  const attempts = [];
  let active = null;
  for (const event of Array.isArray(task?.eventLog) ? task.eventLog : []) {
    const directNodeId = eventNodeId(event);
    if (event.type === 'workflow_node_started' && directNodeId === nodeId) {
      active = {
        id: `${nodeId}-${attempts.length + 1}`,
        events: [event],
        startedAt: event.timestamp || null,
        finishedAt: null,
      };
      attempts.push(active);
      continue;
    }
    if (!active) continue;
    if (directNodeId && directNodeId !== nodeId) continue;
    active.events.push(event);
    if (event.type === 'workflow_node_finished' && directNodeId === nodeId) {
      active.finishedAt = event.timestamp || null;
      active = null;
    }
  }
  const result = task?.workflowRun?.nodes?.[nodeId] || null;
  const persisted = Array.isArray(task?.workflowRun?.node_attempts?.[nodeId])
    ? task.workflowRun.node_attempts[nodeId]
    : [];
  const merged = mergeWorkflowNodeAttempts(persisted, attempts, nodeId);
  if (!merged.length && result) {
    merged.push({ id: `${nodeId}-1`, events: [], result, startedAt: result.started_at || null, finishedAt: result.finished_at || null });
  }
  return merged;
}

export function visibleNodeAttempts(attempts, latestResult, nodeId) {
  if (attempts.length > 0) return attempts;
  return latestResult ? [{
    id: `${nodeId}-persisted`,
    startedAt: latestResult.started_at,
    finishedAt: latestResult.finished_at,
    events: [],
  }] : [];
}

const scopedAttemptCache = new WeakMap();

export function attemptTask(task, attempt, result) {
  const events = attempt?.events || EMPTY_ATTEMPT_EVENTS;
  let scope = scopedAttemptCache.get(events);
  if (!scope || scope.sourceCalls !== task?.toolCalls) {
    const update = streamEventUpdate(events);
    const previous = update?.previous.deref();
    const base = previous && scopedAttemptCache.get(previous);
    const tail = events.at(-1);
    // Only nodeAttempts' text-tail fast path records ancestry on attempt arrays.
    const eventLog = base ? recordStreamEventUpdate(
      [...base.eventLog.slice(0, -1), tail], base.eventLog, base.eventLog.length - 1,
    ) : events.filter((event) => !event.type?.startsWith('workflow_'));
    scope = { eventLog, sourceCalls: task?.toolCalls, toolCalls: base && base.sourceCalls === task?.toolCalls
      && previous.at(-1)?.callId === tail?.callId
      ? base.toolCalls : workflowToolCallsForAttempt(task?.toolCalls, events) };
    scopedAttemptCache.set(events, scope);
  }
  return {
    ...task,
    eventLog: scope.eventLog,
    toolCalls: scope.toolCalls,
    answerText: result?.summary || '',
  };
}

export function detailText(value, fallback = '') {
  if (value == null || value === '') return fallback;
  if (typeof value === 'string') return value;
  return workflowArgumentsText(value);
}

export function nodeConversationInputValue(node, attempt, result) {
  const startedEvent = attempt?.events?.find((event) => event.type === 'workflow_node_started');
  const inputEvent = node.type === 'tool'
    ? attempt?.events?.find((event) => (
      event?.toolInput != null
      || event?.inputSummary
      || event?.value != null
      || event?.json != null
    )) || startedEvent
    : startedEvent;
  return inputEvent?.nodeInput
    ?? inputEvent?.toolInput
    ?? inputEvent?.inputSummary
    ?? inputEvent?.value
    ?? inputEvent?.json
    ?? inputEvent?.message
    ?? result?.input
    ?? result?.prompt
    ?? (result?.arguments != null ? { tool_name: result?.tool_name || node.tool_name, arguments: result.arguments } : null)
    ?? result?.reviewed_input
    ?? '';
}

export function goalJudgeInput(node, task, input) {
  const workflow = task?.workflowSnapshot;
  const workflowId = workflow?.workflow_id || workflow?.id || task?.requestedWorkflowId;
  if (workflowId !== GOAL_WORKFLOW_ID || node?.id !== 'judge' || node?.type !== 'llm') return null;
  let prompt = input?.prompt;
  if (typeof prompt === 'string') {
    try { prompt = JSON.parse(prompt); } catch { prompt = null; }
  }
  return { goal: typeof prompt?.goal === 'string' ? prompt.goal : '' };
}

export function timestampMs(value) {
  if (typeof value === 'number') return value;
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}
