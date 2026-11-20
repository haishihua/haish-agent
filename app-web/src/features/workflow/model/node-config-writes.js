/** One task owns a serialized write queue. Failed writes block execution until corrected. */
export function createNodeConfigWrites(configs) {
  let current = configs;
  let tail = Promise.resolve();
  const failures = new Map();
  return {
    change(nodeId, config, save) {
      current = { ...current, [nodeId]: config };
      const write = tail.then(() => save?.(nodeId, config));
      tail = write.then(() => { failures.delete(nodeId); }, (error) => { failures.set(nodeId, error); });
      return write;
    },
    read() { return current; },
    sync(configs) { current = configs; },
    async flush() {
      let observed;
      do { observed = tail; await observed; } while (observed !== tail);
      if (failures.size) throw failures.values().next().value;
      return current;
    },
  };
}
