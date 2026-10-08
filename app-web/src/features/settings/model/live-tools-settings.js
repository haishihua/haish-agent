// Skill inventory is server-owned, never a persisted configuration draft.
export function withoutStoredSkillInventory(records) {
  return {
    ...records,
    tools: (records?.tools || []).map(record => {
      if (record.id !== 'tools-skills') return record;
      return { ...record, skills: [], skill_groups: null, skill_workspace: '', skill_errors: [], skill_install_root: '', skill_can_install: false, skill_inventory_ready: false };
    }),
  };
}

// Each refresh supersedes the previous one, even if the transport ignores abort.
export function createLiveToolsLoader({ fetchPayload, onState, onPayload, cachedPayload }) {
  let sequence = 0;
  let controller;
  let disposed = false;
  let hasInventory = Boolean(cachedPayload?.skills?.items);
  if (hasInventory) onPayload(cachedPayload);
  return {
    async refresh() {
      if (disposed) return;
      const current = ++sequence;
      controller?.abort();
      controller = new AbortController();
      onState({ status: hasInventory ? 'ready' : 'loading', refreshing: hasInventory, error: '' });
      try {
        const payload = await fetchPayload(controller.signal);
        if (disposed || current !== sequence) return;
        if (!payload?.skills || !Array.isArray(payload.skills.items)) {
          throw new Error('The Settings service returned an invalid skills list.');
        }
        onPayload(payload);
        hasInventory = true;
        onState({ status: 'ready', refreshing: false, error: '' });
      } catch (error) {
        if (disposed || current !== sequence) return;
        onState({ status: hasInventory ? 'ready' : 'error', refreshing: false, error: String(error?.message || 'Unable to load current skills.') });
      }
    },
    dispose() {
      disposed = true;
      sequence += 1;
      controller?.abort();
    },
  };
}
