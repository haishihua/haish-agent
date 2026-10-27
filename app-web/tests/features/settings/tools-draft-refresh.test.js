import test from 'node:test';
import assert from 'node:assert/strict';
import { applyToolsSettingsPayloadToRecords, buildToolsSettingsPayload } from '../../../src/features/settings/model/settings-payload.js';
import { createDefaultSettingsRecords } from '../../../src/features/settings/model/settings-records.js';
import { createSettingsHandlers } from '../../../src/features/settings/hooks/createSettingsHandlers.js';

const fullPayload = {
  mcp: { config: { servers: { saved: {} } }, path: '/fixture/mcp.json' },
  web_search: { provider: 'serpapi', providers: { tavily: { api_key_configured: true }, serpapi: { api_key_configured: true } } },
  skills: { items: [{ name: 'latest' }] },
};
const find = (records, id) => records.tools.find(record => record.id === id);
const edit = records => ({ ...records, tools: records.tools.map(record => record.id === 'tools-mcp'
  ? { ...record, mcp_json: '{"servers":{"draft":{}}}' }
  : record.id === 'tools-web' ? { ...record, web_search: { ...record.web_search, provider: 'tavily', providers: { ...record.web_search.providers, tavily: { ...record.web_search.providers.tavily, api_key: 'fixture-unsaved-key' } } } } : record) });

test('first configuration GET initializes untouched fields', () => {
  const initial = createDefaultSettingsRecords();
  const loaded = applyToolsSettingsPayloadToRecords(initial, fullPayload, initial);
  assert.deepEqual(JSON.parse(find(loaded, 'tools-mcp').mcp_json), fullPayload.mcp.config);
  assert.equal(find(loaded, 'tools-web').web_search.provider, 'serpapi');
  assert.equal(find(loaded, 'tools-web').web_search.providers.tavily.api_key_configured, true);
});

test('delayed first GET preserves MCP, provider and key typed during the request, initializes untouched metadata', async () => {
  const initial = createDefaultSettingsRecords();
  let resolve;
  const request = new Promise(yes => { resolve = yes; });
  let records = initial;
  const load = request.then(payload => { records = applyToolsSettingsPayloadToRecords(records, payload, initial); });
  records = edit(records);
  resolve(fullPayload);
  await load;
  assert.equal(find(records, 'tools-mcp').mcp_json, '{"servers":{"draft":{}}}');
  assert.equal(find(records, 'tools-web').web_search.provider, 'tavily');
  assert.equal(find(records, 'tools-web').web_search.providers.tavily.api_key, 'fixture-unsaved-key');
  assert.equal(find(records, 'tools-web').web_search.providers.serpapi.api_key_configured, true);
  assert.equal(find(records, 'tools-skills').skills[0].name, 'latest');
});

for (const action of ['install', 'toggle', 'uninstall']) {
  test(`skill ${action} response never overwrites unsaved MCP/search drafts`, async () => {
    let records = edit(createDefaultSettingsRecords());
    const before = structuredClone(records);
    const handlers = createSettingsHandlers({
      API_BASE: '', applyToolsSettingsPayloadToRecords, setSkillActionBusy() {}, showToast() {},
      setSettingsRecordsDraft: update => { records = update(records); },
      apiFetch: async () => ({ ok: true, json: async () => fullPayload }),
    });
    if (action === 'install') await handlers.handleInstallSkillPackage(new Blob());
    if (action === 'toggle') await handlers.handleToggleSkill('fixture', true);
    if (action === 'uninstall') await handlers.handleUninstallSkill('fixture');
    for (const id of ['tools-mcp', 'tools-web']) assert.deepEqual(find(records, id), find(before, id));
    assert.deepEqual(find(records, 'tools-skills').skills, fullPayload.skills.items);
  });
}

test('tools save readback preserves edits made while PUT was in flight', async t => {
  const previous = globalThis.window;
  globalThis.window = { localStorage: { setItem() {} } };
  t.after(() => { globalThis.window = previous; });
  let resolve;
  const request = new Promise(yes => { resolve = yes; });
  let records = createDefaultSettingsRecords();
  const handlers = createSettingsHandlers({
    API_BASE: '', settingsRecordsDraft: records, buildToolsSettingsPayload, applyToolsSettingsPayloadToRecords, showToast() {},
    apiFetch: () => request, setSettingsRecordsDraft: update => { records = update(records); },
  });
  const save = handlers.handleSaveSettingsDraft('tools');
  records = edit(records);
  resolve({ ok: true, json: async () => fullPayload });
  assert.equal(await save, true);
  assert.equal(find(records, 'tools-mcp').mcp_json, '{"servers":{"draft":{}}}');
  assert.equal(find(records, 'tools-web').web_search.providers.tavily.api_key, 'fixture-unsaved-key');
});
