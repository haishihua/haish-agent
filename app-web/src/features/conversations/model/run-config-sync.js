// Serial writes per conversation; scope selections are live, not schedule snapshots.
export function createRunConfigSync(api) {
  const selections = new Map();
  const queues = new Map();
  return {
    async waitForSave(id) {
      let pending;
      do {
        pending = queues.get(id);
        if (pending) await pending;
      } while (queues.get(id) !== pending);
    },
    async load(id) { await this.waitForSave(id); return api.get(id); },
    observe(scope, config) { selections.set(scope, structuredClone(config)); },
    async flush(id, scope) {
      const config = selections.get(scope);
      if (!config) throw new Error('Conversation model configuration is not ready.');
      const before = queues.get(id) || Promise.resolve();
      const next = before.catch(() => {}).then(() => api.save(id, config));
      queues.set(id, next);
      try { await next; } finally { if (queues.get(id) === next) queues.delete(id); }
      // Selection may have changed while the request was in flight.
      if (JSON.stringify(selections.get(scope)) !== JSON.stringify(config)) return this.flush(id, scope);
      return config;
    },
  };
}
