import { useEffect, useState } from 'react';
import { trackSettingsDraft, onSettingsInvalidated, invalidateSettings } from '../../../shared/lib/settings-sync.js';
import { findSettingsRecord, settingsRecordSyncTargets } from '../model/settings-payload.js';

export function useSettingsSynchronization({ records, llm, agents, workflows }) {
  const [epochs, setEpochs] = useState({});
  for (const { kind, section, resource, value } of settingsRecordSyncTargets()) {
    trackSettingsDraft(resource, value(findSettingsRecord(records?.[section], kind)));
  }
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
