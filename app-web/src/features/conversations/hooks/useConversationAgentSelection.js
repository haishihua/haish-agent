import React from 'react';
import { conversationHasSentMessage, sentTaskSummaries } from '../model/agent-binding.js';
import { conversationAgentOptions, workspaceWithAgentSelection } from '../model/agent-selection.js';

export function useConversationAgentSelection({ conversation, options, messages, pendingTask, running, queued, setWorkspaceState }) {
  const agentOptions = React.useMemo(() => conversationAgentOptions(options, conversation), [options, conversation]);
  const onAgentChange = React.useCallback((id) => {
    setWorkspaceState((state) => workspaceWithAgentSelection(state, conversation?.id, id, agentOptions));
  }, [setWorkspaceState, conversation?.id, agentOptions]);
  const locked = running || Boolean(queued);
  return {
    agentOptions,
    onAgentChange,
    lockedAgentId: conversation?.agentId || '',
    hasSentMessage: conversationHasSentMessage({
      tasks: sentTaskSummaries(conversation?.tasks, pendingTask),
      hasUserTurn: messages.some((message) => message.role === 'user' && !message.unaccepted),
    }),
    agentLocked: locked,
    agentLockedReason: locked ? 'Stop the active task and wait for teardown before switching Agent.' : '',
  };
}
