import test from 'node:test';
import assert from 'node:assert/strict';
import { applyToolsSettingsPayloadToRecords, applyMemorySettingsPayloadToRecords, applyKnowledgeSettingsPayloadToRecords, buildMemorySettingsPayload, buildKnowledgeSettingsPayload } from '../../../src/features/settings/model/settings-payload.js';
import { createDefaultSettingsRecords } from '../../../src/features/settings/model/settings-records.js';
import { createSettingsHandlers } from '../../../src/features/settings/hooks/createSettingsHandlers.js';

test('the memory and knowledge switches survive a save round trip', () => {
  const defaults = createDefaultSettingsRecords();
  assert.equal(defaults.memory[0].enabled, true);
  assert.equal(defaults.knowledge[0].enabled, true);

  const off = {
    ...defaults,
    memory: defaults.memory.map((record) => ({ ...record, enabled: false })),
    knowledge: defaults.knowledge.map((record) => ({ ...record, enabled: false })),
  };
  assert.equal(buildMemorySettingsPayload(off).enabled, false);
  assert.equal(buildKnowledgeSettingsPayload(off).enabled, false);

  // The editor switch is the only writer of `enabled`; the runtime must hand it
  // back untouched instead of defaulting the switch to on again.
  const restored = applyKnowledgeSettingsPayloadToRecords(
    applyMemorySettingsPayloadToRecords(off, { enabled: false, neo4j: { uri: 'bolt://host:7687' } }),
    { enabled: false, qdrant: { url: 'http://host:6333' } },
  );
  assert.equal(restored.memory[0].enabled, false);
  assert.equal(restored.memory[0].neo4j.uri, 'bolt://host:7687');
  assert.equal(restored.knowledge[0].enabled, false);
  assert.equal(restored.knowledge[0].qdrant.url, 'http://host:6333');

  // A runtime that predates the switch leaves it on rather than off.
  const legacy = applyMemorySettingsPayloadToRecords(defaults, { neo4j: { uri: '' } });
  assert.equal(legacy.memory[0].enabled, true);
});

test('failed settings saves return false so the editor keeps its draft open', async t => {
  const previousWindow = globalThis.window;
  globalThis.window = { localStorage: { setItem() {} } };
  t.after(() => { globalThis.window = previousWindow; });
  const notices = [];
  const handlers = createSettingsHandlers({
    API_BASE: '', llmSettingsDraft: { chat: { model: 'draft-model' } }, settingsRecordsDraft: {},
    apiFetch: async () => ({ ok: false, status: 503 }),
    parseResponseMessage: async () => 'Runtime unavailable',
    showToast: (...args) => notices.push(args),
  });
  assert.equal(await handlers.handleSaveSettingsDraft(), false);
  assert.deepEqual(notices, [['error', 'Runtime unavailable']]);
});

test('skill installation sends the selected archive and refreshes persisted skills', async () => {
  const file = new Blob(['sample archive'], { type: 'application/zip' });
  let state = { tools: [{ id: 'tools-skills' }] };
  const busy = [];
  const handlers = createSettingsHandlers({
    API_BASE: '', applyToolsSettingsPayloadToRecords, setSkillActionBusy: value => busy.push(value),
    setSettingsRecordsDraft: update => { state = update(state); }, showToast() {},
    apiFetch: async (url, init) => {
      assert.equal(url, '/api/settings/tools/skills/install');
      assert.equal(init.body, file);
      assert.equal(init.headers['Content-Type'], 'application/zip');
      return { ok: true, json: async () => ({ skills: { can_install: true, items: [{ name: 'example', source: 'installed' }] } }) };
    },
  });
  assert.equal(await handlers.handleInstallSkillPackage(file), true);
  assert.equal(state.tools.find(record => record.id === 'tools-skills').skills[0].name, 'example');
  assert.deepEqual(busy, ['install', '']);
});

test('failed skill installs retain the upload and release the busy state', async () => {
  const busy = [];
  const handlers = createSettingsHandlers({
    API_BASE: '', applyToolsSettingsPayloadToRecords, setSkillActionBusy: value => busy.push(value), showToast() {},
    apiFetch: async () => ({ ok: false, status: 409 }),
    parseResponseMessage: async () => 'Already installed',
    setSettingsRecordsDraft: () => assert.fail('Failed install must not change records'),
  });
  await assert.rejects(handlers.handleInstallSkillPackage(new Blob()), /Already installed/);
  assert.deepEqual(busy, ['install', '']);
});
