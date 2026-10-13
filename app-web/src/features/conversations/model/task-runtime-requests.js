function abortError() {
  return new DOMException('Task runtime loading was cancelled', 'AbortError');
}

/**
 * Coalesce overlapping task batches, not just identical arrays. The shared map
 * survives controller recreation on React renders. Each caller owns a lease:
 * cancelling one caller must not abort a request still needed by another.
 */
export async function fetchCoalescedTaskRuntimeBatch(
  fetches,
  conversationId,
  taskIds,
  fetchBatch,
  signal,
) {
  if (signal?.aborted) throw abortError();
  const ids = [...new Set(taskIds.filter(Boolean))];
  if (!ids.length) return [];
  // Namespace batch entries separately from the single-task polling promises.
  const keyFor = (id) => JSON.stringify(['task-runtime-batch', conversationId, id]);
  const missingIds = ids.filter((id) => !fetches.has(keyFor(id)));
  if (missingIds.length) {
    const group = { controller: new AbortController(), consumers: 0, settled: false };
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
        group,
        promise: request.then((details) => details.find((detail) => detail.normalizedTask.task_id === id)),
      };
      entries.set(key, entry);
      fetches.set(key, entry);
    }
  }
  const pending = ids.map((id) => fetches.get(keyFor(id)));
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
