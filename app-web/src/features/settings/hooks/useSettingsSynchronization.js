import { useEffect, useState } from 'react';
import { trackSettingsDraft, onSettingsInvalidated, invalidateSettings } from '../../../shared/lib/settings-sync.js';

export function useSettingsSynchronization({ records, llm, agents, workflows }) {
  const [epochs, setEpochs] = useState({});
  for (const [id, resource, field] of [['tools-mcp', 'mcp', 'mcp_json'], ['tools-web', 'web_search', 'web_search']]) {
    trackSettingsDraft(resource, records.tools?.find(row => row.id === id)?.[field]);
  }
  trackSettingsDraft('memory', records.memory?.find(row => row.id === 'memory-qdrant'));
  trackSettingsDraft('llm', llm);
  trackSettingsDraft('agents', agents);
  trackSettingsDraft('workflows', workflows);
  useEffect(() => {
    const stop = onSettingsInvalidated(resources => {
      const changed = new Set(resources || ['mcp', 'web_search', 'skills', 'llm', 'memory', 'agents', 'workflows']);
      if (changed.has('mcp') || changed.has('skills')) changed.add('agents');
      setEpochs(previous => {
        const next = { ...previous };
        changed.forEach(key => { next[key] = (next[key] || 0) + 1; });
        return next;
      });
    });
    const subscription = window.haish?.onSettingsEvent?.(message => {
      invalidateSettings(message.type === 'settings.resync' ? undefined : message.resources);
    });
    const focus = () => invalidateSettings();
    window.addEventListener('focus', focus);
    return () => { stop(); subscription?.(); window.removeEventListener('focus', focus); };
  }, []);
  return { epochs };
}
