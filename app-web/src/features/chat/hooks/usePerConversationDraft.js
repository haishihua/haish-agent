import { useCallback, useRef, useState } from 'react';

/**
 * Keep unsent composer text scoped to a conversation id.
 * Switching conversations saves the previous draft and restores the next one
 * so typed-but-unsent messages never leak across chats.
 */
export function usePerConversationDraft(conversationId) {
  const [drafts, setDrafts] = useState(() => new Map());
  const aliasesRef = useRef(new Map());
  const resolveId = useCallback((id) => {
    while (aliasesRef.current.has(id)) id = aliasesRef.current.get(id);
    return id;
  }, []);
  const draft = drafts.get(resolveId(conversationId)) || '';

  const setDraft = useCallback((value) => {
    const id = resolveId(conversationId);
    if (!id) return;
    setDrafts((previous) => {
      const text = typeof value === 'function' ? value(previous.get(id) || '') : value;
      const next = new Map(previous);
      if (text) next.set(id, text);
      else next.delete(id);
      return next;
    });
  }, [conversationId, resolveId]);

  const rekeyDraft = useCallback((fromId, toId) => {
    fromId = resolveId(fromId);
    toId = resolveId(toId);
    if (!fromId || !toId || fromId === toId) return;
    // In-flight sends still hold the temporary ID after materialization.
    aliasesRef.current.set(fromId, toId);
    setDrafts((previous) => {
      const next = new Map(previous);
      if (next.has(fromId)) next.set(toId, next.get(fromId));
      next.delete(fromId);
      return next;
    });
  }, [resolveId]);

  const clearDraftFor = useCallback((id) => {
    id = resolveId(id);
    setDrafts((previous) => {
      const next = new Map(previous);
      next.delete(id);
      return next;
    });
  }, [resolveId]);

  return { draft, setDraft, rekeyDraft, clearDraftFor };
}
