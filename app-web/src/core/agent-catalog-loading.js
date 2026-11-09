import { agentCatalogFromProfiles } from './agent-settings.js';

// One cancellable attempt. A stale/aborted response never publishes state,
// even if the request implementation resolves after abort. Retry is explicit.
export function startAgentCatalogLoad({ request, url, onState, onCatalog, onRuntime }) {
  const controller = new AbortController();
  let disposed = false;
  const current = () => !disposed && !controller.signal.aborted;
  onState({ status: 'loading', error: '' });
  const done = (async () => {
    try {
      const response = await request(url, { method: 'GET', signal: controller.signal }, { json: false });
      if (!response.ok) throw new Error(`Agent list request failed (${response.status}).`);
      const payload = await response.json();
      if (!current()) return;
      const catalog = agentCatalogFromProfiles(payload);
      if (!catalog.options.length) throw new Error('No available agents returned.');
      onCatalog(catalog);
      onRuntime?.(payload.runtime);
      onState({ status: 'ready', error: '' });
    } catch (error) {
      if (!current()) return;
      onState({ status: 'error', error: error?.message || 'Unable to load agents.' });
    }
  })();
  return { done, cancel: () => { disposed = true; controller.abort(); } };
}

export function staleAgentCatalog(catalog) {
  // Keep names/selections displayable, but not old-workspace permissions or
  // /skill completions. Only a successful current read restores switch targets.
  return { ...catalog, options: catalog.options.map((item) => ({ ...item, unavailable: true, skills: [] })) };
}
