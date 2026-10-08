import { isTaskSettled } from '../../conversations/model/conversation-status.js';
import { requestBelongsToConversation } from '../../approvals/model/approval-store.js';

// Pending backend requests, not historical tool calls or stale waiting status,
// decide which node needs a user's attention.
export function workflowAttentionRequest(workflow, task, inputs = [], approvals = []) {
  if (!task || isTaskSettled(task)) return null;
  const taskId = String(task.taskId || task.task_id || '');
  const conversationId = task.conversationId || task.conversation_id;
  const workflowId = (value) => String(value?.workflow_id || value?.id || '');
  if (workflowId(task.workflowSnapshot) !== workflowId(workflow)) return null;
  for (const [requests, status] of [[inputs, 'waiting_input'], [approvals, 'approval']]) {
    for (const request of requests) {
      if (!requestBelongsToConversation(request, conversationId)) continue;
      const requestTaskId = String(request.task_id || request.taskId || '');
      if (requestTaskId && requestTaskId !== taskId) continue;
      const callId = request.tool_call_id || request.call_id;
      const event = callId ? task.eventLog?.findLast((item) => (item.callId || item.call_id) === callId) : null;
      const nodeId = String(request.workflow_node_id || request.node_id || request.nodeId
        || event?.workflowNodeId || event?.workflow_node_id || task.workflowRun?.current_node_id || '');
      const node = workflow?.nodes?.find((item) => String(item.id) === nodeId);
      if (!node || !['agent', 'llm', 'tool', 'human_approval'].includes(node.type)) continue;
      return { nodeId, status, request, key: `${taskId}:${nodeId}:${status}:${request.request_id || callId || ''}` };
    }
  }
  return null;
}
