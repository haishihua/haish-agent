import { useCallback, useEffect, useMemo, useState } from 'react';
import { readAnnotationDraft, withoutAcknowledgedAnnotations, writeAnnotationDraft } from '../model/message-annotations.js';

export function useAnnotationDraft(scope, messages) {
  const [byScope, setByScope] = useState({});
  const [storageError, setStorageError] = useState('');
  const read = useCallback((id) => {
    try { return readAnnotationDraft(window.localStorage, id); }
    catch { return []; }
  }, []);
  const items = useMemo(() => byScope[scope] ?? read(scope), [byScope, scope, read]);
  const update = useCallback((fn) => {
    if (!scope) return;
    setByScope((previous) => {
      const before = previous[scope] ?? read(scope);
      const after = fn(before);
      return before === after ? previous : { ...previous, [scope]: after };
    });
  }, [scope, read]);
  useEffect(() => {
    // Only server-backed messages can remove a submitted draft.
    update((previous) => withoutAcknowledgedAnnotations(previous, messages));
  }, [messages, update]);
  useEffect(() => {
    try {
      for (const [id, value] of Object.entries(byScope)) writeAnnotationDraft(window.localStorage, id, value);
      setStorageError('');
    } catch {
      setStorageError('Comments are kept in this window, but could not be saved for reload.');
    }
  }, [byScope]);
  return { items, update, storageError };
}
