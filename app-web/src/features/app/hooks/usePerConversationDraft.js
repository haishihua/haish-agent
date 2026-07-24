// @haish-esm
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Keep unsent composer text scoped to a conversation id.
 * Switching conversations saves the previous draft and restores the next one
 * so typed-but-unsent messages never leak across chats.
 */
export function usePerConversationDraft(conversationId) {
  const draftsRef = useRef(new Map());
  const ownerRef = useRef(null);
  const [draft, setDraftState] = useState('');

  useEffect(() => {
    const nextId = conversationId || null;
    setDraftState((current) => {
      const prevId = ownerRef.current;
      if (prevId === nextId) return current;
      if (prevId) {
        if (current) draftsRef.current.set(prevId, current);
        else draftsRef.current.delete(prevId);
      }
      ownerRef.current = nextId;
      return nextId ? (draftsRef.current.get(nextId) || '') : '';
    });
  }, [conversationId]);

  const setDraft = useCallback((value) => {
    setDraftState((prev) => {
      const next = typeof value === 'function' ? value(prev) : value;
      const id = ownerRef.current;
      if (id) {
        if (next) draftsRef.current.set(id, next);
        else draftsRef.current.delete(id);
      }
      return next;
    });
  }, []);

  const rekeyDraft = useCallback((fromId, toId) => {
    if (!fromId || !toId || fromId === toId) return;
    if (ownerRef.current === fromId) {
      ownerRef.current = toId;
      setDraftState((current) => {
        if (current) draftsRef.current.set(toId, current);
        draftsRef.current.delete(fromId);
        return current;
      });
      return;
    }
    if (draftsRef.current.has(fromId)) {
      draftsRef.current.set(toId, draftsRef.current.get(fromId));
      draftsRef.current.delete(fromId);
    }
  }, []);

  const clearDraftFor = useCallback((id) => {
    if (!id) return;
    draftsRef.current.delete(id);
    if (ownerRef.current === id) setDraftState('');
  }, []);

  return { draft, setDraft, rekeyDraft, clearDraftFor };
}
