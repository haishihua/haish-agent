import { useState } from 'react';

// History is a temporary preview, never a write to the conversation's draft.
// The existing per-conversation draft store remains authoritative while browsing.
export function useComposerHistory({ scopeId, draft, onDraftChange, history }) {
  const [preview, setPreview] = useState(null);
  const active = preview?.scopeId === scopeId ? preview : null;
  if (preview && !active) setPreview(null);
  const setDraft = (value) => {
    setPreview(null);
    onDraftChange(value);
  };
  const navigate = (direction) => {
    if (direction === 'newer' && !active) return false;
    const entries = active?.entries || (Array.isArray(history) ? history : []).filter((text) => typeof text === 'string' && text.trim());
    if (!entries.length) return false;
    const cursor = active?.cursor ?? -1;
    const next = direction === 'older' ? Math.min(cursor + 1, entries.length - 1) : cursor - 1;
    setPreview(next < 0 ? null : { scopeId, cursor: next, entries, text: entries[next] });
    return true;
  };
  const restore = () => {
    if (!active) return false;
    setPreview(null);
    return true;
  };
  return { draft: active ? active.text : draft, setDraft, navigate, restore, browsing: Boolean(active) };
}
