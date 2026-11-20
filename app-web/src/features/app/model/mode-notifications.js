import { resolveConversationWaitState } from '../../conversations/model/conversation-run-state.js';

// Aggregate existing unread/attention state; switching modes never acknowledges it.
export function modeNotification(projects, notices, mode, inputs = [], approvals = []) {
  const unread = new Set(Object.values(notices || {}).map((notice) => notice.conversationId));
  let needsAction = false;
  let count = 0;
  for (const project of projects || []) {
    if (project.executionMode !== mode) continue;
    for (const conversation of project.conversations || []) {
      const wait = resolveConversationWaitState({ conversationId: conversation.id, tasks: conversation.tasks || [], pendingInputs: inputs, pendingApprovals: approvals });
      const waiting = wait.state === 'waiting_input' || wait.state === 'approval';
      needsAction ||= waiting;
      if (waiting || unread.has(conversation.id)) count++;
    }
  }
  return { count, needsAction };
}
