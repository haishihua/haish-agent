export const SKILL_TABS = [
  { id: 'tools-skills-builtin', scope: 'builtin', label: 'Built-in' },
  { id: 'tools-skills-global', scope: 'global', label: 'Global' },
  { id: 'tools-skills-project', scope: 'project', label: 'Project' },
];

export function isSkillPage(id) {
  return id === 'tools-skills' || SKILL_TABS.some(tab => tab.id === id);
}

export function skillScopeForPage(id) {
  return SKILL_TABS.find(tab => tab.id === id)?.scope || 'builtin';
}

// Older servers expose only the effective inventory. Do not infer hidden sources.
export function skillGroups(record) {
  if (record?.skill_groups) return record.skill_groups;
  const items = record?.skills || [];
  return {
    builtin: items.filter(item => ['preset', 'builtin'].includes(item.source)),
    global: items.filter(item => !['preset', 'builtin'].includes(item.source) && item.scope !== 'workspace'),
    project: items.filter(item => item.scope === 'workspace'),
  };
}

// Session-local, bounded, owner/workspace-isolated inventory cache. Never store secrets.
export function createSkillInventoryCache(limit = 24) {
  const entries = new Map();
  return {
    get(key) { return entries.get(key); },
    set(key, skills) {
      entries.delete(key);
      entries.set(key, structuredClone(skills));
      while (entries.size > limit) entries.delete(entries.keys().next().value);
    },
    invalidate() { entries.clear(); },
  };
}
