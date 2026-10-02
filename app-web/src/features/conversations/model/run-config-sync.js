// Serial writes per conversation; scope selections are live, not schedule snapshots.
export function createRunConfigSync(api) {
  const selections = new Map();
  const queues = new Map();
  return {
    load: (id) => api.get(id),
    observe(scope, config) { selections.set(scope, structuredClone(config)); },
    async flush(id, scope) {
      const config = selections.get(scope);
      if (!config) throw new Error('Conversation model configuration is not ready.');
      const before = queues.get(id) || Promise.resolve();
      const next = before.catch(() => {}).then(() => api.save(id, config));
      queues.set(id, next);
      await next;
      // Selection may have changed while the request was in flight.
      if (JSON.stringify(selections.get(scope)) !== JSON.stringify(config)) return this.flush(id, scope);
      return config;
    },
  };
}
