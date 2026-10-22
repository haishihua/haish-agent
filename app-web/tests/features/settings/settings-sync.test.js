import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { prepareSettingsRequest, observeSettingsResponse, reconcileSettings, trackSettingsDraft, resetSettingsSync, settingsConflicts, reloadSettings, hasSettingsVersion } from '../../../src/shared/lib/settings-sync.js';
import { createDefaultSettingsRecords } from '../../../src/features/settings/model/settings-records.js';
import { applyToolsSettingsPayloadToRecords, buildToolsSettingsPayload } from '../../../src/features/settings/model/settings-payload.js';
import { createLiveToolsLoader } from '../../../src/features/settings/model/live-tools-settings.js';
import { createSkillInventoryCache } from '../../../src/features/settings/model/skill-inventory.js';
import { apiFetch } from '../../../src/shared/api/client.js';

async function response(request, payload, versions, status = 200) {
  return observeSettingsResponse(new Response(JSON.stringify(payload), { status, headers: { 'x-haish-settings-versions': JSON.stringify(versions) } }), request).json();
}
const path = resource => '/api/settings/' + (['mcp', 'web_search', 'skills'].includes(resource) ? 'tools' : resource);
const read = resource => prepareSettingsRequest(path(resource), { method: 'GET' });
const write = resource => prepareSettingsRequest(path(resource), { method: 'PUT', headers: {}, body: JSON.stringify(['mcp', 'web_search', 'skills'].includes(resource) ? { [resource]: {} } : {}) });

for (const resource of ['mcp', 'web_search', 'llm', 'memory', 'agents', 'workflows']) {
  test(`${resource}: external updates refresh clean drafts, preserve dirty drafts and still save them`, async () => {
    resetSettingsSync();
    const old = { value: 'old' }, fresh = { value: 'fresh' }, edited = { value: 'my edit' };
    trackSettingsDraft(resource, old);
    let payload = await response(read(resource), {}, { [resource]: 'epoch:0' });
    let current = reconcileSettings(resource, old, old, payload);
    payload = await response(read(resource), {}, { [resource]: 'epoch:1' });
    current = reconcileSettings(resource, current, fresh, payload);
    assert.deepEqual(current, fresh);
    trackSettingsDraft(resource, edited);
    payload = await response(read(resource), {}, { [resource]: 'epoch:2' });
    assert.deepEqual(reconcileSettings(resource, edited, { value: 'elsewhere' }, payload), edited);
    assert.ok(settingsConflicts().includes(resource));
    // 旧草稿不拦保存：这一笔照发，只是不带前置版本号（最后写入生效）。
    const stale = write(resource);
    assert.equal(stale.init.headers['If-Haish-Settings-Match'], undefined);
    await response(stale, {}, { [resource]: 'epoch:2' });
    reloadSettings(resource);
    payload = await response(read(resource), {}, { [resource]: 'epoch:3' });
    current = reconcileSettings(resource, edited, { value: 'elsewhere' }, payload);
    assert.equal(current.value, 'elsewhere');
    assert.ok(!settingsConflicts().includes(resource));
    assert.equal(JSON.parse(write(resource).init.headers['If-Haish-Settings-Match'])[resource], 'epoch:3');
  });
}

test('successful write owns its version, late GET and PUT cannot roll it back, later edits survive', async () => {
  resetSettingsSync();
  const old = { value: 'old' }, newer = { value: 'saved' }, edited = { value: 'typing' };
  trackSettingsDraft('memory', old);
  let p = await response(read('memory'), {}, { memory: 'e:0' });
  reconcileSettings('memory', old, old, p);
  const late = read('memory');
  const saving = write('memory');
  trackSettingsDraft('memory', edited);
  p = await response(saving, {}, { memory: 'e:1' });
  assert.deepEqual(reconcileSettings('memory', edited, newer, p), edited);
  assert.ok(!settingsConflicts().length);
  p = await response(late, {}, { memory: 'e:0' });
  assert.deepEqual(reconcileSettings('memory', edited, old, p), edited);
  const first = read('memory'), second = read('memory');
  p = await response(second, {}, { memory: 'e:2' });
  reconcileSettings('memory', newer, { value: 'newest' }, p);
  p = await response(first, {}, { memory: 'e:1' });
  assert.equal(reconcileSettings('memory', { value: 'newest' }, newer, p).value, 'newest');
});

test('partial tools save neither writes nor replaces other drafts; disabled search is preserved', async () => {
  resetSettingsSync();
  let records = createDefaultSettingsRecords();
  records.tools.find(x => x.id === 'tools-mcp').mcp_json = '{invalid local draft';
  const web = records.tools.find(x => x.id === 'tools-web').web_search;
  web.enabled = false; web.mode = 'tavily'; web.providers.tavily.enabled = false;
  assert.deepEqual(Object.keys(buildToolsSettingsPayload(records, 'web_search')), ['web_search']);
  assert.equal(buildToolsSettingsPayload(records, 'web_search').web_search.enabled, false);
  assert.equal(buildToolsSettingsPayload(records, 'web_search').web_search.mode, 'tavily');
  assert.equal(buildToolsSettingsPayload(records, 'web_search').web_search.providers.tavily.enabled, false);
  const request = write('web_search');
  const payload = await response(request, { mcp: { config: { servers: {} } }, web_search: web }, { web_search: 'e:1' });
  records = applyToolsSettingsPayloadToRecords(records, payload);
  assert.equal(records.tools.find(x=>x.id==='tools-mcp').mcp_json, '{invalid local draft');
});

test('production Tools hook accepts external deletion after initialization and on reentry', async () => {
  resetSettingsSync();
  const source = readFileSync(new URL('../../../src/features/settings/hooks/useLiveToolsSettings.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace(/\bexport /g, '');
  const slots = []; let cursor = 0; let effects = [];
  const useRef = value => slots[cursor++] ||= { current: value };
  const useEffect = (fn, deps) => {
    const i = cursor++;
    if (!slots[i] || deps.some((d,n)=>!Object.is(d,slots[i].deps[n]))) effects.push(() => {
      slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: fn() };
    });
  };
  const window = { addEventListener() {}, removeEventListener() {} };
  const hook = vm.runInNewContext(source + '\nuseLiveToolsSettings;', { useRef, useEffect, window, hasSettingsVersion, createLiveToolsLoader });
  const cache = createSkillInventoryCache(), refreshRef = {};
  let records = createDefaultSettingsRecords(); let revision = 0; let enabled = true;
  function render() {
    cursor = 0; effects = [];
    trackSettingsDraft('mcp', records.tools.find(x=>x.id==='tools-mcp').mcp_json);
    hook({ enabled, contextKey: 'fixture', cache, refreshRef, records, refreshEpoch: revision,
      fetchPayload: async () => response(read('mcp'), { mcp: { config: { servers: revision ? {} : { removed: {} } } }, skills: { items: [] } }, { mcp: `e:${revision}`, skills: `e:${revision}` }),
      onState() {}, onPayload: p => { records = applyToolsSettingsPayloadToRecords(records, p); },
    });
    effects.forEach(fn=>fn());
  }
  render(); await new Promise(setImmediate);
  assert.ok(JSON.parse(records.tools.find(x=>x.id==='tools-mcp').mcp_json).servers.removed);
  revision++; render(); await new Promise(setImmediate);
  assert.deepEqual(JSON.parse(records.tools.find(x=>x.id==='tools-mcp').mcp_json).servers, {});
  enabled = false; render(); enabled = true; render(); await new Promise(setImmediate);
  assert.deepEqual(JSON.parse(records.tools.find(x=>x.id==='tools-mcp').mcp_json).servers, {});
  slots.forEach(s=>s.cleanup?.());
});

for (const resource of ['agents', 'workflows']) {
  test(`${resource}: saving one row preserves other unsaved rows and edits made in flight`, async () => {
    resetSettingsSync();
    const id = resource === 'agents' ? 'agent_id' : 'workflow_id';
    const baseline = { presets: [], custom: [{ [id]: 'one', name: 'One' }, { [id]: 'two', name: 'Two' }] };
    trackSettingsDraft(resource, baseline);
    let p = await response(read(resource), {}, { [resource]: 'e:0' });
    reconcileSettings(resource, baseline, baseline, p);
    const draft = { ...baseline, custom: [{ [id]: 'one', name: 'Save me' }, { [id]: 'two', name: 'Keep me' }] };
    trackSettingsDraft(resource, draft);
    const saving = prepareSettingsRequest(`/api/settings/${resource}/custom/one`, { method: 'PUT', body: '{}' });
    assert.throws(() => write(resource), /still being saved/);
    const incoming = { ...baseline, custom: [{ [id]: 'one', name: 'Saved' }, baseline.custom[1]] };
    p = await response(saving, {}, { [resource]: 'e:1' });
    const current = reconcileSettings(resource, draft, incoming, p);
    assert.equal(current.custom[0].name, 'Saved');
    assert.equal(current.custom[1].name, 'Keep me');
    assert.deepEqual(settingsConflicts(), []);
    trackSettingsDraft(resource, current);
    const next = prepareSettingsRequest(`/api/settings/${resource}/custom/one`, { method: 'PUT', body: '{}' });
    const later = { ...current, custom: [{ [id]: 'one', name: 'Typed later' }, current.custom[1]] };
    p = await response(next, {}, { [resource]: 'e:2' });
    assert.equal(reconcileSettings(resource, later, incoming, p).custom[0].name, 'Typed later');
  });
}

test('own-write GET remains deferred after PUT completion, including repeated React updaters', async () => {
  resetSettingsSync();
  const old = { value: 'old' }, draft = { value: 'edited' }, saved = { value: 'normalized' };
  trackSettingsDraft('memory', old);
  let p = await response(read('memory'), {}, { memory: 'e:0' });
  reconcileSettings('memory', old, old, p);
  trackSettingsDraft('memory', draft);
  const saving = write('memory');
  const notificationRead = read('memory');
  p = await response(notificationRead, {}, { memory: 'e:1' });
  assert.equal(reconcileSettings('memory', draft, saved, p), draft);
  const commit = await response(saving, {}, { memory: 'e:1' });
  assert.equal(reconcileSettings('memory', draft, saved, p), draft, 'deferred read cannot steal the write baseline');
  assert.equal(reconcileSettings('memory', draft, saved, commit), saved);
  assert.equal(reconcileSettings('memory', draft, saved, commit), saved, 'Strict Mode repeat remains idempotent');
  p = await response(read('memory'), {}, { memory: 'e:2' });
  const external = { value: 'external' };
  assert.equal(reconcileSettings('memory', saved, external, p), external);
  assert.equal(reconcileSettings('memory', saved, external, p), external, 'repeat clean GET stays clean');
  assert.deepEqual(settingsConflicts(), []);
});

test('redacted secret changes cannot bless a dirty draft with a newer revision', async () => {
  resetSettingsSync();
  const baseline = { key: '', configured: true, enabled: true };
  trackSettingsDraft('web_search', baseline);
  let p = await response(read('web_search'), {}, { web_search: 'e:0' });
  reconcileSettings('web_search', baseline, baseline, p);
  const dirty = { ...baseline, enabled: false };
  trackSettingsDraft('web_search', dirty);
  p = await response(read('web_search'), {}, { web_search: 'e:1' });
  assert.equal(reconcileSettings('web_search', dirty, baseline, p), dirty);
  assert.deepEqual(settingsConflicts(), ['web_search']);
  // 冲突只决定要不要带前置版本号，不再拦截保存。
  const stale = write('web_search');
  assert.equal(stale.init.headers['If-Haish-Settings-Match'], undefined);
  await response(stale, {}, { web_search: 'e:1' });
});

test('explicit reload cannot discard edits typed after its confirmation', async () => {
  resetSettingsSync();
  const old = { value: 'old' }, dirty = { value: 'dirty' }, later = { value: 'later' };
  trackSettingsDraft('memory', old);
  let p = await response(read('memory'), {}, { memory: 'e:0' });
  reconcileSettings('memory', old, old, p);
  trackSettingsDraft('memory', dirty);
  reloadSettings('memory');
  trackSettingsDraft('memory', later);
  p = await response(read('memory'), {}, { memory: 'e:1' });
  assert.equal(reconcileSettings('memory', later, { value: 'external' }, p), later);
  assert.deepEqual(settingsConflicts(), ['memory']);
});

test('real API client releases failed/non-JSON writes and sends the accepted precondition', async t => {
  resetSettingsSync();
  const previousFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = previousFetch; });
  const old = { value: 'old' };
  trackSettingsDraft('memory', old);
  globalThis.fetch = async () => new Response('{}', { headers: { 'x-haish-settings-versions': '{"memory":"e:0"}' } });
  let p = await (await apiFetch(path('memory'))).json();
  reconcileSettings('memory', old, old, p);
  globalThis.fetch = async (_url, init) => {
    assert.equal(JSON.parse(init.headers['If-Haish-Settings-Match']).memory, 'e:0');
    throw new Error('network down');
  };
  await assert.rejects(apiFetch(path('memory'), { method: 'PUT', body: '{}' }), /network down/);
  globalThis.fetch = async () => new Response('not json', { status: 500 });
  await assert.rejects((await apiFetch(path('memory'), { method: 'PUT', body: '{}' })).json());
  globalThis.fetch = async () => new Response('{}', { headers: { 'x-haish-settings-versions': '{"memory":"e:1"}' } });
  p = await (await apiFetch(path('memory'))).json();
  assert.deepEqual(reconcileSettings('memory', old, { value: 'fresh' }, p), { value: 'fresh' });
});

test('desktop forwards settings events and reconnect invalidations without forwarding settings data', () => {
  const main = readFileSync(new URL('../../../../src/main/main.ts', import.meta.url), 'utf8');
  const realtime = readFileSync(new URL('../../../../src/main/realtime-client.ts', import.meta.url), 'utf8');
  const preload = readFileSync(new URL('../../../../src/preload/preload.ts', import.meta.url), 'utf8');
  // 实时消息的分发在 realtime-client.ts，重连后的 settings.resync 仍由 main.ts 的订阅发送。
  assert.match(realtime, /message.type === 'settings.event'/);
  assert.match(main, /runtime:settings-event', \{ type: 'settings.resync' \}/);
  assert.match(preload, /onSettingsEvent:/);
});
