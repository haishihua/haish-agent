import { isTaskLive, isTaskSettled, workflowTaskDisplayStatus } from '../../conversations/model/conversation-status.js';
import { isTerminalTaskStatus, normalizeTaskStatus } from '../../tasks/model/task-runtime.js';
import { workflowApprovalDecisionStatus } from './runtime-workflow-layout.js';

export function workflowRuntimeDisplayStatus(task) {
  const status = normalizeTaskStatus(workflowTaskDisplayStatus(task));
  // A terminal receipt can arrive before either status field is persisted.
  return isTaskSettled(task) && !isTerminalTaskStatus(status) && status !== 'succeeded' ? 'done' : status;
}

export function workflowRuntimeNodeStatus(
  node,
  run,
  task,
  activeEventNodeIds = new Set(),
  eventNodeOutcomes = new Map(),
  traversedLoopNodeIds = new Set(),
) {
  const result = run?.nodes?.[node.id];
  const approvalDecision = workflowApprovalDecisionStatus(node, result);
  const normalized = normalizeTaskStatus(result?.status || '');
  const runStatus = normalizeTaskStatus(run?.status || '');
  const taskStatus = normalizeTaskStatus(task?.status);
  const current = run?.current_node_id === node.id;
  const activeFromEvents = activeEventNodeIds.has(String(node.id));
  const eventOutcome = eventNodeOutcomes.get(String(node.id));
  if (isTaskSettled(task)) {
    // Keep recorded outcomes. Only unfinished active nodes inherit task termination.
    if (!activeFromEvents && eventOutcome && eventOutcome !== 'running') return eventOutcome;
    if (approvalDecision) return approvalDecision;
    if (normalized === 'cancelled') return 'cancelled';
    if (result?.success === false || normalized === 'failed') return 'failed';
    if (result && (result.success === true || result.finished_at || result.finishedAt || isTerminalTaskStatus(normalized) || normalized === 'succeeded')) return 'done';
    if (current || activeFromEvents || normalized === 'running') return workflowRuntimeDisplayStatus(task);
    if (result) return normalized === 'queued' && result.status ? 'pending' : 'done';
    if (node.type === 'loop' && traversedLoopNodeIds.has(String(node.id))) return 'done';
    return 'pending';
  }
  if (current && (runStatus === 'waiting_input' || taskStatus === 'waiting_input')) return 'waiting_input';
  if (current && node.type === 'human_approval' && (runStatus === 'waiting_approval' || runStatus === 'approval')) return 'approval';
  // Unfinished attempts reach the UI before current_node_id is persisted.
  if (activeFromEvents) {
    if (runStatus === 'waiting_input' || taskStatus === 'waiting_input') return 'waiting_input';
    if (node.type === 'human_approval' && (runStatus === 'approval' || runStatus === 'waiting_approval')) return 'approval';
    if (isTaskLive(task)) return 'running';
  }
  if (approvalDecision) return approvalDecision;
  if (eventOutcome && eventOutcome !== 'running') return eventOutcome;
  if (normalized === 'cancelled') return 'cancelled';
  if (runStatus === 'cancelled' && current) return 'cancelled';
  if (normalized === 'waiting_input') return 'waiting_input';
  if (result?.success === false || normalized === 'failed') return 'failed';
  if (current && (!result || normalized === 'running' || normalized === 'queued') && isTaskLive(task)) {
    return node.type === 'human_approval' ? 'approval' : 'running';
  }
  if (result) return 'done';
  if (node.type === 'loop' && traversedLoopNodeIds.has(String(node.id))) return 'done';
  return 'pending';
}
