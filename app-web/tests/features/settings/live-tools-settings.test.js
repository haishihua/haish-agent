import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { withoutStoredSkillInventory, createLiveToolsLoader } from '../../../src/features/settings/model/live-tools-settings.js';
import { loadSettingsRecordsDraft } from '../../../src/features/settings/model/settings-records.js';
import { applyToolsSettingsPayloadToRecords, buildToolsSettingsPayload } from '../../../src/features/settings/model/settings-payload.js';

const payload = count => ({ skills: { items: Array.from({ length: count }, (_, n) => ({ name: `skill-${n}` })) } });
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

test('stored skill inventory and old errors are discarded, unrelated drafts survive', t => {
  const stored = { tools: [{ id: 'tools-skills', skills: payload(36).skills.items, skill_errors: [{ code: 'old' }], skill_install_root: '/old' }, { id: 'tools-mcp', mcp_json: '{"draft":true}' }] };
  const before = structuredClone(stored);
  const clean = withoutStoredSkillInventory(stored);
  assert.deepEqual(clean.tools[0].skills, []);
  assert.deepEqual(clean.tools[0].skill_errors, []);
  assert.equal(clean.tools[0].skill_can_install, false);
  assert.equal(clean.tools[1].mcp_json, '{"draft":true}');
  assert.deepEqual(stored, before);
  const previous = globalThis.window;
  globalThis.window = { localStorage: { getItem: () => JSON.stringify(stored) } };
  t.after(() => { globalThis.window = previous; });
  const loaded = loadSettingsRecordsDraft();
  assert.deepEqual(loaded.tools.find(r => r.id === 'tools-skills').skills, []);
  assert.equal(loaded.tools.find(r => r.id === 'tools-mcp').mcp_json, '{"draft":true}');
});

test('saving another section before skills load does not enable every skill accidentally', () => {
  const records = { tools: [{ id: 'tools-skills', skills: [{ name: 'wait-what', enabled: false }] }] };
  const pending = withoutStoredSkillInventory(records);
  assert.equal('skills' in buildToolsSettingsPayload(pending), false);
  const loaded = applyToolsSettingsPayloadToRecords(pending, { skills: { items: [{ name: 'wait-what', enabled: false }] } });
  assert.deepEqual(buildToolsSettingsPayload(loaded).skills, { disabled: ['wait-what'] });
});

test('refresh uses the latest list, not a fixed count or a previous response', async () => {
  const states = [];
  const counts = [];
  let count = 17;
  const loader = createLiveToolsLoader({ fetchPayload: async () => payload(count), onState: s => states.push(s.status), onPayload: p => counts.push(p.skills.items.length) });
  await loader.refresh();
  count = 36;
  await loader.refresh();
  assert.deepEqual(counts, [17, 36]);
  assert.deepEqual(states, ['loading', 'ready', 'ready', 'ready']);
});

test('late previous responses cannot overwrite a newer workspace response', async () => {
  const first = deferred();
  const second = deferred();
  const applied = [];
  const signals = [];
  const loader = createLiveToolsLoader({ fetchPayload: signal => { signals.push(signal); return signals.length === 1 ? first.promise : second.promise; }, onState: () => {}, onPayload: p => applied.push(p.skills.items.length) });
  const a = loader.refresh();
  const b = loader.refresh();
  assert.equal(signals[0].aborted, true);
  second.resolve(payload(17));
  await b;
  first.resolve(payload(36));
  await a;
  assert.deepEqual(applied, [17]);
});

test('failure is explicit, invalid data is not shown as an empty inventory, retry works', async () => {
  const states = [];
  const applied = [];
  let value = {};
  const loader = createLiveToolsLoader({ fetchPayload: async () => value, onState: s => states.push(s), onPayload: p => applied.push(p) });
  await loader.refresh();
  assert.equal(states.at(-1).status, 'error');
  assert.equal(applied.length, 0);
  value = payload(0);
  await loader.refresh();
  assert.equal(states.at(-1).status, 'ready');
  assert.equal(applied[0].skills.items.length, 0);
});

test('disposed requests do not update state, including failed requests', async () => {
  const request = deferred();
  const states = [];
  const loader = createLiveToolsLoader({ fetchPayload: () => request.promise, onState: s => states.push(s.status), onPayload: () => assert.fail('disposed') });
  const run = loader.refresh();
  loader.dispose();
  request.reject(new Error('late failure'));
  await run;
  assert.deepEqual(states, ['loading']);
});

test('production wiring hides stale numbers and rows, fetches without browser cache, and preserves non-skill drafts', () => {
  const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
  const shell = read('../../../src/features/app/AppShell.jsx');
  const page = read('../../../src/features/settings/components/SettingsPage.jsx');
  const editor = read('../../../src/features/settings/components/ToolsConfigEditor.jsx');
  const handlers = read('../../../src/features/settings/hooks/createSettingsHandlers.js');
  assert.match(shell, /cache: 'no-store', signal/);
  assert.match(shell, /toolsLoadState.key === toolsContextKey/);
  assert.match(shell, /toolsContextKey = skillInventoryKey/);
  assert.match(shell, /settingsMode && \(settingsSection === 'tools' \|\| skillsExpanded\)/);
  assert.match(shell, /onSkillsExpandedChange=\{setSkillsExpanded\}/);
  assert.match(page, /open=\{skillsOpen\} onOpenChange=\{setSkillsOpen\}/);
  assert.match(page, /onSkillsExpandedChange\?\.\(skillsVisible\)/);
  assert.match(page, /Retry skill counts/);
  assert.match(shell, /\{ skills: payload.skills \} : payload/);
  const loaderHook = read('../../../src/features/settings/hooks/useLiveToolsSettings.js');
  assert.match(loaderHook, /window.addEventListener\('focus', refresh\)/);
  assert.match(loaderHook, /\[enabled, contextKey, busy, refreshRef, cache\]/);
  assert.doesNotMatch(loaderHook, /settingsSelection|settingsSection/);
  assert.doesNotMatch(page, /tab === 'tools-skills' \?/);
  assert.match(editor, /skillsPane && toolsSettingsState.status !== 'ready'/);
  assert.match(editor, /<LoadingState role="status" label="Loading settings…"/);
  assert.doesNotMatch(editor, /Loading current skills/);
  assert.match(editor, />Retry<\/Button>/);
  assert.match(handlers, /JSON.stringify\(withoutStoredSkillInventory\(settingsRecordsDraft\)\)/);
});
