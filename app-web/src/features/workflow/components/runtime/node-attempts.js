// 节点执行记录的纯投影：一次尝试里的事件、输入与结果文本。UI 无关。
import {
  mergeWorkflowNodeAttempts,
  workflowToolCallsForAttempt,
} from '../../model/runtime-workflow-layout.js';
import { workflowArgumentsText } from '../../model/workflow-catalog.js';

function eventNodeId(event) {
  return String(event?.workflowNodeId || event?.workflow_node_id || event?.nodeId || event?.node_id || '');
}

export function nodeAttempts(task, nodeId) {
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

export function attemptTask(task, attempt, result) {
  const events = attempt?.events || [];
  return {
    ...task,
    eventLog: events.filter((event) => !event.type?.startsWith('workflow_')),
    toolCalls: workflowToolCallsForAttempt(task?.toolCalls, events),
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

export function timestampMs(value) {
  if (typeof value === 'number') return value;
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}
