/**
 * A blank "new conversation" is local-only: it stays out of the sidebar until
 * the first message is sent, so there is no list entry to switch back to. Its
 * unsent text lives in the per-conversation composer store, keyed by the
 * conversation id — and every click on "+" used to mint a fresh id, orphaning
 * whatever the user had typed. Remembering one draft id per project keeps that
 * blank chat (and its draft text) reachable while the user visits other
 * conversations, and the id is forgotten once the draft becomes a real
 * conversation so later drafts start clean.
 */
export function rememberDraftConversationId(registry, projectId, generateId) {
  const key = String(projectId || '');
  if (!key) return `draft-${generateId()}`;
  const remembered = registry?.get(key);
  if (remembered) return remembered;
  const created = `draft-${generateId()}`;
  registry?.set(key, created);
  return created;
}

export function forgetDraftConversationId(registry, projectId) {
  const key = String(projectId || '');
  if (key) registry?.delete(key);
}
