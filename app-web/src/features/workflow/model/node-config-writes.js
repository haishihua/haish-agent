/** Serialize saves; failed edits revert to the last confirmed node configuration. */
export function createNodeConfigWrites(configs) {
  let current = configs;
  let confirmed = { ...configs };
  let tail = Promise.resolve();
  const pending = new Map();
  return {
    change(nodeId, config, save) {
      current = { ...current, [nodeId]: config };
      const token = {};
      pending.set(nodeId, token);
      const write = tail.then(() => save?.(nodeId, config));
      tail = write.then(() => {
        confirmed = { ...confirmed, [nodeId]: config };
        if (pending.get(nodeId) === token) pending.delete(nodeId);
      }, () => {
        if (pending.get(nodeId) === token) {
          pending.delete(nodeId);
          current = { ...current, [nodeId]: confirmed[nodeId] };
        }
      });
      return write;
    },
    read() { return current; },
    sync(configs) {
      current = configs;
      for (const [id, config] of Object.entries(configs)) {
        if (!pending.has(id)) confirmed[id] = config;
      }
    },
    async flush() {
      let observed;
      do { observed = tail; await observed; } while (observed !== tail);
      return current;
    },
  };
}
