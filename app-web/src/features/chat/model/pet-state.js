import { terminalTaskNoticeStatus } from '../../tasks/model/task-completion-notices.js';
import { buildChatTimeline, resolveAgentActivity } from './chat-timeline.js';
import { attemptTask, nodeAttempts } from '../../workflow/model/node-attempts.js';

export function nextPetCompletion(previous, current) {
  if (!current?.conversationId) return { tracked: null, celebrate: false };
  const sameConversation = previous?.conversationId === current.conversationId;
  const previousTask = sameConversation ? previous : null;
  const status = terminalTaskNoticeStatus(current.taskStatus);
  if (current.active && current.taskId && !status) {
    return { tracked: { conversationId: current.conversationId, taskId: current.taskId }, celebrate: false };
  }
  if (!current.active && previousTask && previousTask.taskId === current.taskId && status) {
    return { tracked: null, celebrate: status === 'done' };
  }
  if (current.taskId && previousTask && current.taskId !== previousTask.taskId) {
    return { tracked: null, celebrate: false };
  }
  return { tracked: previousTask || null, celebrate: false };
}

export function petActivityFromMessages(messages, taskId, runState) {
  if (!taskId) return null;
  const message = (Array.isArray(messages) ? messages : []).findLast((row) => (
    row.role === 'agent' && row.streaming && String(row.taskId || '') === String(taskId)
  ));
  return message ? resolveAgentActivity(message.traceTimeline, true, runState)?.state || null : null;
}

export function petActivityFromWorkflow(task, runState) {
  const nodeId = task?.workflowRun?.current_node_id;
  if (!nodeId) return null;
  const attempt = nodeAttempts(task, nodeId).at(-1);
  const scoped = attemptTask(task, attempt, task?.workflowRun?.nodes?.[nodeId]);
  return resolveAgentActivity(buildChatTimeline(scoped, 'running').items, true, runState)?.state || null;
}

export function petTargetState({ runState, running, submitPending, activityState }) {
  if (runState === 'waiting_input' || runState === 'approval') return 'thinking';
  if (running || submitPending || runState === 'running') {
    // The activity resolver calls the displayed "Thinking" state composing.
    // Listening stays in the thinking pose while awaiting user input or approval.
    if (!activityState || ['composing', 'thinking', 'searching', 'listening'].includes(activityState)) return 'thinking';
    return 'working';
  }
  return 'idle';
}
