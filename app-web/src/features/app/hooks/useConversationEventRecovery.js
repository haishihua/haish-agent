import React from 'react';

export function useConversationEventRecovery({ ensureConversationRuntime, recoverConversationTasks }) {
  React.useEffect(() => window.haish?.onConversationEvent?.((message) => {
    const id = message?.conversation?.conversation_id;
    if (message?.type !== 'conversation.updated' || !id) return;
    ensureConversationRuntime(id);
    recoverConversationTasks(id).catch((error) => console.warn('conversation update recovery failed', error));
  }), [ensureConversationRuntime, recoverConversationTasks]);
}
