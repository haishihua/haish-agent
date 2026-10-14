function abortError() {
  return new DOMException('Task runtime loading was cancelled', 'AbortError');
}

/**
 * Coalesce single-task GETs and overlapping batches. The shared map
 * survives controller recreation on React renders. Each caller owns a lease:
 * cancelling one caller must not abort a request still needed by another.
 */
export async function fetchCoalescedTaskRuntimeBatch(
  fetches,
  conversationId,
  taskIds,
  fetchBatch,
  signal,
  { requestKind = 'batch', joinBatch = true } = {},
) {
  if (signal?.aborted) throw abortError();
  const ids = [...new Set(taskIds.filter(Boolean))];
  if (!ids.length) return [];
  // Task ids are globally unique. A GET has no conversation in its URL, so
  // either transport may join that unscoped lease; distinct declared owners
  // remain isolated and callers validate the returned task's owner.
  // Confirmation GETs must bypass even another still-pending batch. Keep a
  // separate key so they cannot replace that batch's entry/cleanup ownership.
  const keyFor = (id) => JSON.stringify(['task-runtime', conversationId, id, ...(!joinBatch ? ['single-confirmation'] : [])]);
  const canJoin = (entry, id) => entry?.taskId === id
    && (!conversationId || !entry.conversationId || entry.conversationId === conversationId)
    && (joinBatch || entry.group.requestKind === 'single');
  const entryFor = (id) => {
    const exact = fetches.get(keyFor(id));
    return canJoin(exact, id) ? exact : [...fetches.values()].find((entry) => canJoin(entry, id));
  };
  const missingIds = ids.filter((id) => !entryFor(id));
  if (missingIds.length) {
    const group = { controller: new AbortController(), consumers: 0, settled: false, requestKind };
    const entries = new Map();
    group.cleanup = () => {
      for (const [key, entry] of entries) {
        if (fetches.get(key) === entry) fetches.delete(key);
      }
    };
    // Register every task before starting the transport, including synchronous
    // mock/failing transports. Normalize the payload just once in fetchBatch.
    const request = Promise.resolve().then(() => {
      if (group.controller.signal.aborted) throw abortError();
      return fetchBatch(missingIds, group.controller.signal);
    }).finally(() => {
      group.settled = true;
      group.cleanup();
    });
    for (const id of missingIds) {
      const key = keyFor(id);
      const entry = {
        taskId: id,
        conversationId,
        group,
        promise: request.then((details) => details.find((detail) => detail.normalizedTask.task_id === id)),
      };
      entries.set(key, entry);
      fetches.set(key, entry);
    }
  }
  const pending = ids.map(entryFor);
  const groups = new Set(pending.map((entry) => entry.group));
  for (const group of groups) group.consumers += 1;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    for (const group of groups) {
      group.consumers -= 1;
      if (group.consumers === 0 && !group.settled) {
        group.controller.abort();
        // Do not make an immediate retry join an already cancelled request.
        group.cleanup();
      }
    }
  };
  let onAbort;
  try {
    const response = Promise.all(pending.map((entry) => entry.promise));
    if (!signal) return await response;
    const cancelled = new Promise((_resolve, reject) => {
      onAbort = () => { release(); reject(abortError()); };
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
    return await Promise.race([response, cancelled]);
  } finally {
    if (onAbort) signal.removeEventListener('abort', onAbort);
    release();
  }
}
