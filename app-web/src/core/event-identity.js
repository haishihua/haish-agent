function value(event, snakeKey, camelKey = snakeKey) {
  return event?.[snakeKey] ?? event?.[camelKey] ?? event?.data?.[snakeKey] ?? event?.data?.[camelKey] ?? null;
}

export function runtimeEventIds(event) {
  if (Array.isArray(event?.deltaEventIds)) return event.deltaEventIds;
  const id = value(event, 'event_id', 'eventId');
  return id ? [id] : [];
}

// Each ingest belongs to one task. Keep identities, never fragment text. Seed
// once from compacted history, then reject raw replay BEFORE any text batching.
// A compacted event is already an accepted batch; its ids seed the same Set.
export function createRuntimeEventIngest(events = []) {
  const seen = new Set();
  const accept = (event) => {
    const ids = runtimeEventIds(event);
    if (!ids.length) return true;
    const scope = JSON.stringify([
      event.type,
      value(event, 'parent_call_id', 'parentCallId'),
      value(event, 'call_id', 'callId'),
    ]);
    let fresh = false;
    for (const id of ids) {
      const key = `${scope}:${id}`;
      if (!seen.has(key)) fresh = true;
      seen.add(key);
    }
    return fresh;
  };
  for (const event of events) accept(event);
  return accept;
}

export function deduplicateRuntimeEvents(events) {
  if (!Array.isArray(events)) return [];
  const accept = createRuntimeEventIngest();
  return events.filter(accept);
}
