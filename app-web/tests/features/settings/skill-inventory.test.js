import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SKILL_TABS, isSkillPage, skillScopeForPage, skillGroups, createSkillInventoryCache } from '../../../src/features/settings/model/skill-inventory.js';
import { createLiveToolsLoader } from '../../../src/features/settings/model/live-tools-settings.js';
import { applyToolsSettingsPayloadToRecords } from '../../../src/features/settings/model/settings-payload.js';
import { createSettingsHandlers } from '../../../src/features/settings/hooks/createSettingsHandlers.js';

const skill = name => ({ name, enabled: true });

test('three tabs retain global sources independently of effective project overrides', () => {
  assert.deepEqual(SKILL_TABS.map(t => t.scope), ['builtin', 'global', 'project']);
  for (const tab of SKILL_TABS) { assert.ok(isSkillPage(tab.id)); assert.equal(skillScopeForPage(tab.id), tab.scope); }
  assert.ok(isSkillPage('tools-skills'));
  assert.equal(isSkillPage('tools-mcp'), false);
  const groups = { builtin: [skill('preset')], global: [{ ...skill('shared'), shadowed: true }], project: [skill('shared')] };
  const records = applyToolsSettingsPayloadToRecords({}, { skills: { items: [skill('shared')], groups, workspace: '/project/a' } });
  const record = records.tools.find(r => r.id === 'tools-skills');
  assert.deepEqual(skillGroups(record), groups);
  assert.equal(record.skill_workspace, '/project/a');
  assert.equal(record.skills.length, 1);
});

test('older server inventory is classified by source and scope', () => {
  const groups = skillGroups({ skills: [
    { name: 'preset', source: 'preset' }, { name: 'uploaded', source: 'installed', scope: 'user' },
    { name: 'codex', source: 'codex-copy', scope: 'user' }, { name: 'local', source: 'codex-copy', scope: 'workspace' },
  ] });
  assert.equal(groups.builtin.length, 1);
  assert.equal(groups.global.length, 2);
  assert.equal(groups.project.length, 1);
});

test('cache isolates contexts, replaces full snapshots, bounds size, and invalidates after writes', () => {
  const cache = createSkillInventoryCache(2);
  cache.set('owner/a', { items: [skill('a')] });
  cache.set('owner/b', { items: [skill('b')] });
  assert.equal(cache.get('owner/a').items[0].name, 'a');
  cache.set('owner/b', { items: [] });
  assert.equal(cache.get('owner/b').items.length, 0);
  cache.set('other/a', { items: [skill('c')] });
  assert.equal(cache.get('owner/a'), undefined);
  cache.invalidate();
  assert.equal(cache.get('owner/b'), undefined);
});

test('cached list stays visible while revalidating; failures remain explicit and successful refresh replaces it', async () => {
  const applied = [], states = [];
  let fail = true;
  const loader = createLiveToolsLoader({
    cachedPayload: { skills: { items: [skill('cached')] } },
    fetchPayload: async () => { if (fail) throw new Error('offline'); return { skills: { items: [] } }; },
    onPayload: payload => applied.push(payload.skills.items), onState: state => states.push(state),
  });
  await loader.refresh();
  assert.equal(states[0].status, 'ready');
  assert.equal(states[0].refreshing, true);
  assert.equal(states.at(-1).error, 'offline');
  assert.equal(applied.length, 1);
  fail = false;
  await loader.refresh();
  assert.deepEqual(applied.at(-1), []);
  assert.equal(states.at(-1).error, '');
});

test('all skill mutation paths invalidate cache even on failure and bind the conversation', async () => {
  const calls = [];
  let invalidations = 0;
  const handlers = createSettingsHandlers({
    API_BASE: '', skillConversationId: 'chat/a', invalidateSkillInventory: () => invalidations++,
    apiFetch: async (url, options) => { calls.push([url, options.method]); return { ok: false, status: 400 }; },
    parseResponseMessage: async () => 'failure', setSkillActionBusy: () => {}, showToast: () => {},
  });
  await assert.rejects(handlers.handleInstallSkillPackage(new Blob()), /failure/);
  await handlers.handleToggleSkill('demo', false);
  await handlers.handleUninstallSkill('demo');
  assert.equal(invalidations, 3);
  assert.ok(calls.every(([url]) => url.includes('?conversation_id=chat%2Fa')));
  assert.ok(calls[0][0].endsWith('&scope=global'));
});

test('project install and removal send explicit scope with the same conversation', async () => {
  const calls = [];
  const handlers = createSettingsHandlers({
    API_BASE: '', skillConversationId: 'selected', setSkillActionBusy: () => {}, showToast: () => {},
    applyToolsSettingsPayloadToRecords, setSettingsRecordsDraft: update => update({}),
    apiFetch: async (url, options) => { calls.push([url, options.method]); return { ok: true, json: async () => ({ skills: { items: [] } }) }; },
  });
  await handlers.handleInstallSkillPackage(new Blob(), 'project');
  await handlers.handleUninstallSkill('demo', 'project');
  assert.deepEqual(calls, [
    ['/api/settings/tools/skills/install?conversation_id=selected&scope=project', 'POST'],
    ['/api/settings/tools/skills/demo?conversation_id=selected&scope=project', 'DELETE'],
  ]);
});

test('production UI separates scopes, identifies project and discloses global enablement', () => {
  const source = fs.readFileSync(new URL('../../../src/features/settings/components/ToolsConfigEditor.jsx', import.meta.url), 'utf8');
  const navigation = fs.readFileSync(new URL('../../../src/features/settings/model/settings-navigation.js', import.meta.url), 'utf8');
  const page = fs.readFileSync(new URL('../../../src/features/settings/components/SettingsPage.jsx', import.meta.url), 'utf8');
  assert.match(navigation, /children: SKILL_TABS/);
  assert.match(page, /settings-skill-nav-children/);
  assert.doesNotMatch(source, /role="tablist"/);
  assert.match(source, /skillTab !== 'builtin' && current.skill_can_install/);
  assert.match(source, /settings-skill-actions/);
  assert.match(source, /onInstallSkill\(file, skillTab\)/);
  assert.match(source, /current.skill_workspace/);
  assert.match(source, /Enablement is shared across projects/);
  assert.match(source, /Overridden by the current project/);
});
