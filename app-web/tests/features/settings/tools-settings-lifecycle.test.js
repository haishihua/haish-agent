import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { hasSettingsVersion, resetSettingsSync, copySettingsResponse } from '../../../src/shared/lib/settings-sync.js';
import { createSettingsHandlers } from '../../../src/features/settings/hooks/createSettingsHandlers.js';
import { createLiveToolsLoader } from '../../../src/features/settings/model/live-tools-settings.js';
import { createSkillInventoryCache } from '../../../src/features/settings/model/skill-inventory.js';
import { createDefaultSettingsRecords } from '../../../src/features/settings/model/settings-records.js';
import { applyToolsSettingsPayloadToRecords, buildToolsSettingsPayload } from '../../../src/features/settings/model/settings-payload.js';
import { setMcpServerEnabled } from '../../../src/features/settings/model/mcp-server-toggle.js';

const hookSource = readFileSync(new URL('../../../src/features/settings/hooks/useLiveToolsSettings.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').replace(/\bexport /g, '');
const shellSource = readFileSync(new URL('../../../src/features/app/AppShell.jsx', import.meta.url), 'utf8');
const applyStart = shellSource.indexOf('    applyToolsSettingsPayloadToRecords: ') + '    applyToolsSettingsPayloadToRecords: '.length;
const applySource = shellSource.slice(applyStart, shellSource.indexOf('\n    apiFetch,', applyStart)).trim().replace(/,$/, '');
const payloadStart = shellSource.indexOf('    onPayload: ', shellSource.indexOf(' = useLiveToolsSettings({')) + '    onPayload: '.length;
const payloadSource = shellSource.slice(payloadStart, shellSource.indexOf('\n  });', payloadStart)).trim().replace(/,$/, '');
const find = (records, id) => records.tools.find(record => record.id === id);
const patch = (records, id, fields) => ({ ...records, tools: records.tools.map(record => record.id === id ? { ...record, ...fields } : record) });
const snapshot = (config, inventory, configured = false) => ({
  mcp: { config, path: '/fixture/saved-mcp.json' },
  web_search: { mode: 'hybrid', providers: { tavily: { api_key: '', api_key_configured: configured } } },
  skills: { items: [{ name: inventory }] },
});
const settled = () => new Promise(resolve => setImmediate(resolve));

// Run the production hook and loader with deterministic React ref/effect slots,
// then route production handlers through the same draft setter as AppShell.
function harness(t, initial = createDefaultSettingsRecords()) {
  resetSettingsSync();
  const previousWindow = globalThis.window;
  const listeners = new Map();
  const stored = [];
  const window = {
    localStorage: { setItem: (...args) => stored.push(args) },
    addEventListener: (event, listener) => listeners.set(event, listener),
    removeEventListener: (event, listener) => { if (listeners.get(event) === listener) listeners.delete(event); },
  };
  globalThis.window = window;
  const slots = [];
  let cursor = 0;
  let effects;
  const useRef = initialValue => slots[cursor++] ||= { current: initialValue };
  const useEffect = (effect, deps) => {
    const index = cursor++;
    if (!slots[index] || deps.some((dep, i) => !Object.is(dep, slots[index].deps[i]))) effects.push(() => {
      slots[index]?.cleanup?.();
      slots[index] = { deps, cleanup: effect() };
    });
  };
  const useLiveToolsSettings = vm.runInNewContext(`${hookSource}\nuseLiveToolsSettings;`, { useRef, useEffect, createLiveToolsLoader, window, hasSettingsVersion });
  const cache = createSkillInventoryCache();
  const refreshRef = { current: null };
  const requests = [];
  const states = [];
  const notices = [];
  let records = initial;
  let beginToolsSettingsSave;
  let invalidations = 0;
  const apiFetch = (url, init) => new Promise(resolve => requests.push({ url, init, resolve }));
  const setSettingsRecordsDraft = update => { records = typeof update === 'function' ? update(records) : update; render(); };
  // Execute the actual AppShell callbacks, not lookalike test wrappers.
  const onPayload = vm.runInNewContext(`(${payloadSource})`, { setSettingsRecordsDraft, applyToolsSettingsPayloadToRecords });
  const applyReadback = vm.runInNewContext(`(${applySource})`, {
    skillInventoryKey: 'fixture-workspace', skillInventoryKeyRef: { current: 'fixture-workspace' }, applyToolsSettingsPayloadToRecords, copySettingsResponse,
  });
  function render() {
    cursor = 0;
    effects = [];
    beginToolsSettingsSave = useLiveToolsSettings({
      enabled: true, contextKey: 'fixture-workspace', busy: '', refreshRef, cache, records,
      fetchPayload: async signal => {
        const response = await apiFetch('/api/settings/tools?conversation_id=fixture', { method: 'GET', signal });
        return response.json();
      },
      onPayload,
      onState: state => states.push(state),
    });
    effects.forEach(effect => effect());
  }
  render();
  t.after(() => {
    slots.forEach(slot => slot?.cleanup?.());
    globalThis.window = previousWindow;
  });
  return {
    get records() { return records; },
    get invalidations() { return invalidations; },
    requests, states, notices, stored, cache, refreshRef,
    edit: setSettingsRecordsDraft,
    focus: () => listeners.get('focus')(),
    respond: (request, payload) => request.resolve({ ok: true, json: async () => payload }),
    handlers: () => createSettingsHandlers({
      API_BASE: '', SETTINGS_RECORDS_STORAGE_KEY: 'fixture-records', skillConversationId: 'fixture',
      settingsRecordsDraft: records, buildToolsSettingsPayload, applyToolsSettingsPayloadToRecords: applyReadback,
      setSettingsRecordsDraft, apiFetch, beginToolsSettingsSave,
      invalidateSkillInventory: () => { invalidations += 1; cache.invalidate(); },
      parseResponseMessage: async () => 'fixture save failure',
      showToast: (...args) => notices.push(args),
    }),
  };
}

for (const enabled of [false, true]) {
  test(`real staged MCP toggle ${enabled ? 'enables' : 'disables'} on readback and the next save cannot undo it`, async t => {
    const config = { servers: { fixture: { command: 'fixture', enabled: !enabled } } };
    const h = harness(t, patch(createDefaultSettingsRecords(), 'tools-mcp', { mcp_json: JSON.stringify(config, null, 2) }));
    h.respond(h.requests[0], snapshot(config, 'initial'));
    await settled();
    const nextConfig = setMcpServerEnabled(config, 'fixture', enabled);
    const staged = patch(h.records, 'tools-mcp', { mcp_json: JSON.stringify(nextConfig, null, 2) });
    const save = h.handlers().handleSaveToolsSettingsDraft(staged, `fixture ${enabled ? 'enabled' : 'disabled'}`);
    assert.deepEqual(JSON.parse(find(h.records, 'tools-mcp').mcp_json), config, 'the row does not optimistically publish staged records');
    assert.deepEqual(JSON.parse(h.requests[1].init.body).mcp.config, nextConfig);
    assert.equal(h.requests[1].url, '/api/settings/tools?conversation_id=fixture');
    assert.equal(h.requests[1].init.method, 'PUT');
    h.respond(h.requests[1], snapshot(nextConfig, 'saved'));
    assert.equal(await save, true);
    assert.deepEqual(JSON.parse(find(h.records, 'tools-mcp').mcp_json), nextConfig);
    const nextSave = h.handlers().handleSaveSettingsDraft('tools');
    assert.deepEqual(JSON.parse(h.requests[2].init.body).mcp.config, nextConfig, 'subsequent saves submit the switched state');
    h.respond(h.requests[2], snapshot(nextConfig, 'saved-again'));
    assert.equal(await nextSave, true);
  });
}

test('a staged MCP PUT preserves genuine MCP and search-key edits made during the request', async t => {
  const config = { servers: { fixture: { enabled: true } } };
  const h = harness(t, patch(createDefaultSettingsRecords(), 'tools-mcp', { mcp_json: JSON.stringify(config, null, 2) }));
  h.respond(h.requests[0], snapshot(config, 'initial'));
  await settled();
  const nextConfig = setMcpServerEnabled(config, 'fixture', false);
  const staged = patch(h.records, 'tools-mcp', { mcp_json: JSON.stringify(nextConfig, null, 2) });
  const save = h.handlers().handleSaveToolsSettingsDraft(staged);
  const editedConfig = { servers: { editedDuringPut: { enabled: true } } };
  h.edit(prev => patch(prev, 'tools-mcp', { mcp_json: JSON.stringify(editedConfig, null, 2) }));
  h.edit(prev => {
    const web = find(prev, 'tools-web').web_search;
    return patch(prev, 'tools-web', { web_search: { ...web, providers: { ...web.providers, tavily: { ...web.providers.tavily, api_key: 'fixture-new-draft-key' } } } });
  });
  h.respond(h.requests[1], snapshot(nextConfig, 'put-inventory', true));
  assert.equal(await save, true);
  assert.deepEqual(JSON.parse(find(h.records, 'tools-mcp').mcp_json), editedConfig);
  assert.equal(find(h.records, 'tools-web').web_search.providers.tavily.api_key, 'fixture-new-draft-key');
  assert.equal(find(h.records, 'tools-web').web_search.providers.tavily.api_key_configured, true);
  assert.equal(find(h.records, 'tools-skills').skills[0].name, 'put-inventory');
});

test('pending first GET cannot roll back a successful PUT whose MCP draft still equals the GET baseline', async t => {
  const h = harness(t);
  const baseline = find(h.records, 'tools-mcp').mcp_json;
  const config = JSON.parse(baseline);
  const save = h.handlers().handleSaveSettingsDraft('tools');
  h.respond(h.requests[1], snapshot(config, 'put-inventory'));
  assert.equal(await save, true);
  assert.equal(find(h.records, 'tools-mcp').mcp_json, baseline, 'the write did not change MCP text');
  assert.equal(h.invalidations, 1);
  assert.equal(h.requests[0].init.signal.aborted, false, 'configuration writes do not cancel inventory discovery');
  h.respond(h.requests[0], { ...snapshot({ servers: { stale: {} } }, 'late-get-inventory'), mcp: { config: { servers: { stale: {} } }, path: '/fixture/old-mcp.json' } });
  await settled();
  assert.equal(find(h.records, 'tools-mcp').mcp_json, baseline);
  assert.equal(find(h.records, 'tools-mcp').mcp_path, '/fixture/saved-mcp.json');
  assert.equal(find(h.records, 'tools-skills').skills[0].name, 'late-get-inventory', 'inventory remains independently applicable');
  assert.equal(h.cache.get('fixture-workspace').items[0].name, 'late-get-inventory');
  assert.equal(h.states.at(-1).status, 'ready');
  h.focus();
  h.respond(h.requests[2], snapshot({ servers: { refreshed: {} } }, 'focus-inventory'));
  await settled();
  assert.equal(find(h.records, 'tools-mcp').mcp_json, baseline);
  assert.equal(find(h.records, 'tools-skills').skills[0].name, 'focus-inventory');
});

test('pending first GET cannot roll back a saved key after PUT redacts it to empty but configured', async t => {
  const h = harness(t);
  const config = JSON.parse(find(h.records, 'tools-mcp').mcp_json);
  h.edit(prev => {
    const web = find(prev, 'tools-web').web_search;
    return patch(prev, 'tools-web', { web_search: { ...web, providers: { ...web.providers, tavily: { ...web.providers.tavily, api_key: 'fixture-saved-key' } } } });
  });
  const save = h.handlers().handleSaveSettingsDraft('tools');
  assert.equal(JSON.parse(h.requests[1].init.body).web_search.providers.tavily.api_key, 'fixture-saved-key');
  h.respond(h.requests[1], snapshot(config, 'put-inventory', true));
  assert.equal(await save, true);
  assert.equal(find(h.records, 'tools-web').web_search.providers.tavily.api_key, '');
  assert.equal(find(h.records, 'tools-web').web_search.providers.tavily.api_key_configured, true);
  h.respond(h.requests[0], snapshot(config, 'late-get-inventory', false));
  await settled();
  assert.equal(find(h.records, 'tools-web').web_search.providers.tavily.api_key, '');
  assert.equal(find(h.records, 'tools-web').web_search.providers.tavily.api_key_configured, true);
  assert.equal(find(h.records, 'tools-skills').skills[0].name, 'late-get-inventory');
  const nextSave = h.handlers().handleSaveSettingsDraft('tools');
  assert.equal('api_key' in JSON.parse(h.requests[2].init.body).web_search.providers.tavily, false, 'empty readback must not submit a key deletion');
  h.respond(h.requests[2], snapshot(config, 'next-put', true));
  assert.equal(await nextSave, true);
});

for (const getFirst of [true, false]) {
  for (const enabled of [false, true]) {
    test(`first GET ${getFirst ? 'before' : 'after'} staged MCP PUT readback does not discard the ${enabled ? 'enable' : 'disable'}`, async t => {
      const config = { servers: { fixture: { command: 'fixture', enabled: !enabled } } };
      const h = harness(t, patch(createDefaultSettingsRecords(), 'tools-mcp', { mcp_json: JSON.stringify(config, null, 2) }));
      const nextConfig = setMcpServerEnabled(config, 'fixture', enabled);
      const staged = patch(h.records, 'tools-mcp', { mcp_json: JSON.stringify(nextConfig, null, 2) });
      const save = h.handlers().handleSaveToolsSettingsDraft(staged);
      const respondGet = async () => {
        h.respond(h.requests[0], snapshot({ servers: { fixture: { command: 'get-normalized', enabled: !enabled } } }, 'get-inventory'));
        await settled();
      };
      if (getFirst) {
        await respondGet();
        assert.deepEqual(JSON.parse(find(h.records, 'tools-mcp').mcp_json), config, 'initial hydration is paused as soon as the write starts');
        assert.equal(find(h.records, 'tools-skills').skills[0].name, 'get-inventory', 'inventory need not wait for configuration');
      }
      h.respond(h.requests[1], snapshot(nextConfig, 'put-inventory', true));
      assert.equal(await save, true);
      if (!getFirst) await respondGet();
      assert.deepEqual(JSON.parse(find(h.records, 'tools-mcp').mcp_json), nextConfig);
      assert.equal(find(h.records, 'tools-web').web_search.providers.tavily.api_key_configured, true);
      const nextSave = h.handlers().handleSaveSettingsDraft('tools');
      assert.deepEqual(JSON.parse(h.requests[2].init.body).mcp.config, nextConfig, 'the next save cannot undo the switch');
      h.respond(h.requests[2], snapshot(nextConfig, 'next-put', true));
      assert.equal(await nextSave, true);
    });
  }

  test(`first GET ${getFirst ? 'before' : 'after'} staged PUT preserves genuine in-flight edits`, async t => {
    const config = { servers: { fixture: { enabled: true } } };
    const h = harness(t, patch(createDefaultSettingsRecords(), 'tools-mcp', { mcp_json: JSON.stringify(config, null, 2) }));
    const nextConfig = setMcpServerEnabled(config, 'fixture', false);
    const staged = patch(h.records, 'tools-mcp', { mcp_json: JSON.stringify(nextConfig, null, 2) });
    const save = h.handlers().handleSaveToolsSettingsDraft(staged);
    const respondGet = async () => {
      h.respond(h.requests[0], snapshot({ servers: { initial: {} } }, 'get-inventory'));
      await settled();
    };
    if (getFirst) await respondGet();
    const edited = { servers: { editedDuringPut: { enabled: true } } };
    h.edit(prev => patch(prev, 'tools-mcp', { mcp_json: JSON.stringify(edited, null, 2) }));
    h.edit(prev => {
      const web = find(prev, 'tools-web').web_search;
      return patch(prev, 'tools-web', { web_search: { ...web, mode: 'tavily', providers: { ...web.providers, tavily: { ...web.providers.tavily, api_key: 'fixture-in-flight-key' } } } });
    });
    h.respond(h.requests[1], snapshot(nextConfig, 'put-inventory', true));
    assert.equal(await save, true);
    if (!getFirst) await respondGet();
    assert.deepEqual(JSON.parse(find(h.records, 'tools-mcp').mcp_json), edited);
    assert.equal(find(h.records, 'tools-web').web_search.mode, 'tavily');
    assert.equal(find(h.records, 'tools-web').web_search.providers.tavily.api_key, 'fixture-in-flight-key');
    assert.equal(find(h.records, 'tools-web').web_search.providers.tavily.api_key_configured, true);
  });

  test(`failed staged MCP PUT still initializes first GET arriving ${getFirst ? 'before' : 'after'} failure`, async t => {
    const config = { servers: { fixture: { enabled: true } } };
    const h = harness(t, patch(createDefaultSettingsRecords(), 'tools-mcp', { mcp_json: JSON.stringify(config, null, 2) }));
    const nextConfig = setMcpServerEnabled(config, 'fixture', false);
    const staged = patch(h.records, 'tools-mcp', { mcp_json: JSON.stringify(nextConfig, null, 2) });
    const save = h.handlers().handleSaveToolsSettingsDraft(staged);
    const serverConfig = { servers: { initial: {} } };
    const respondGet = async () => {
      h.respond(h.requests[0], snapshot(serverConfig, 'initial', true));
      await settled();
    };
    if (getFirst) {
      await respondGet();
      assert.deepEqual(JSON.parse(find(h.records, 'tools-mcp').mcp_json), config, 'failed write has not settled yet');
    }
    h.requests[1].resolve({ ok: false, status: 503 });
    assert.equal(await save, false);
    assert.equal(h.invalidations, 0);
    if (!getFirst) {
      assert.deepEqual(JSON.parse(find(h.records, 'tools-mcp').mcp_json), config, 'the staged toggle was never published');
      await respondGet();
    }
    assert.deepEqual(JSON.parse(find(h.records, 'tools-mcp').mcp_json), serverConfig);
    assert.equal(find(h.records, 'tools-web').web_search.providers.tavily.api_key_configured, true);
    assert.equal(find(h.records, 'tools-skills').skills[0].name, 'initial');
    assert.deepEqual(h.notices, [['error', 'fixture save failure']]);
  });
}

test('failed PUT replays deferred initialization without erasing edits made after GET arrival', async t => {
  const h = harness(t);
  const config = JSON.parse(find(h.records, 'tools-mcp').mcp_json);
  const save = h.handlers().handleSaveToolsSettingsDraft(patch(h.records, 'tools-mcp', { mcp_json: JSON.stringify({ servers: { staged: {} } }, null, 2) }));
  h.respond(h.requests[0], snapshot(config, 'deferred-inventory', true));
  await settled();
  h.edit(prev => patch(prev, 'tools-mcp', { mcp_json: '{"servers":{"editedAfterGet":{}}}' }));
  h.edit(prev => {
    const web = find(prev, 'tools-web').web_search;
    return patch(prev, 'tools-web', { web_search: { ...web, providers: { ...web.providers, tavily: { ...web.providers.tavily, api_key: 'fixture-after-get-key' } } } });
  });
  h.requests[1].resolve({ ok: false, status: 503 });
  assert.equal(await save, false);
  assert.equal(find(h.records, 'tools-mcp').mcp_json, '{"servers":{"editedAfterGet":{}}}');
  assert.equal(find(h.records, 'tools-web').web_search.providers.tavily.api_key, 'fixture-after-get-key');
  assert.equal(find(h.records, 'tools-web').web_search.providers.tavily.api_key_configured, true);
  assert.equal(find(h.records, 'tools-skills').skills[0].name, 'deferred-inventory');
});

test('production AppShell readback wrapper forwards the request baseline in current and switched workspaces', () => {
  const initial = createDefaultSettingsRecords();
  const edited = patch(patch(initial, 'tools-mcp', { mcp_json: '{"servers":{"unsaved":{}}}' }), 'tools-web', {
    web_search: { ...find(initial, 'tools-web').web_search, mode: 'tavily', providers: {
      ...find(initial, 'tools-web').web_search.providers,
      tavily: { ...find(initial, 'tools-web').web_search.providers.tavily, api_key: 'fixture-wrapper-key' },
    } },
  });
  for (const currentKey of ['at-request', 'switched-workspace']) {
    const applyReadback = vm.runInNewContext(`(${applySource})`, {
      skillInventoryKey: 'at-request', skillInventoryKeyRef: { current: currentKey }, applyToolsSettingsPayloadToRecords, copySettingsResponse,
    });
    const payload = snapshot({ servers: { saved: {} } }, 'request-workspace-inventory', true);
    const untouched = applyReadback(initial, payload, initial);
    assert.deepEqual(JSON.parse(find(untouched, 'tools-mcp').mcp_json), payload.mcp.config, 'untouched configuration still initializes');
    const result = applyReadback(edited, payload, initial);
    assert.equal(find(result, 'tools-mcp').mcp_json, find(edited, 'tools-mcp').mcp_json, 'the third argument protects MCP edits');
    assert.equal(find(result, 'tools-web').web_search.mode, 'tavily');
    assert.equal(find(result, 'tools-web').web_search.providers.tavily.api_key, 'fixture-wrapper-key');
    assert.equal(find(result, 'tools-web').web_search.providers.tavily.api_key_configured, true);
    assert.equal(find(result, 'tools-skills').skills.length, currentKey === 'at-request' ? 1 : 0, 'only current-workspace inventory is applied');
  }
});

test('first GET still initializes untouched configuration while protecting unsaved edits across focus', async t => {
  const h = harness(t);
  h.edit(prev => patch(prev, 'tools-mcp', { mcp_json: '{"servers":{"unsaved":{}}}' }));
  h.edit(prev => {
    const web = find(prev, 'tools-web').web_search;
    return patch(prev, 'tools-web', { web_search: { ...web, providers: { ...web.providers, tavily: { ...web.providers.tavily, api_key: 'fixture-unsaved-key' } } } });
  });
  h.focus();
  assert.equal(h.requests[0].init.signal.aborted, true);
  h.respond(h.requests[0], snapshot({ servers: { superseded: {} } }, 'superseded'));
  await settled();
  assert.equal(find(h.records, 'tools-skills').skills.length, 0);
  h.respond(h.requests[1], snapshot({ servers: { initial: {} } }, 'initial', true));
  await settled();
  assert.equal(find(h.records, 'tools-mcp').mcp_json, '{"servers":{"unsaved":{}}}');
  assert.equal(find(h.records, 'tools-web').web_search.providers.tavily.api_key, 'fixture-unsaved-key');
  assert.equal(find(h.records, 'tools-web').web_search.providers.tavily.api_key_configured, true);
  assert.equal(find(h.records, 'tools-skills').skills[0].name, 'initial');
});
