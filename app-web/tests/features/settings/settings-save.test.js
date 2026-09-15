import test from 'node:test';
import assert from 'node:assert/strict';
import { applyToolsSettingsPayloadToRecords, applyMemorySettingsPayloadToRecords, buildMemorySettingsPayload } from '../../../src/features/settings/model/settings-payload.js';
import { SETTINGS_RECORDS_STORAGE_KEY, createDefaultSettingsRecords, loadSettingsRecordsDraft } from '../../../src/features/settings/model/settings-records.js';
import { createSettingsHandlers } from '../../../src/features/settings/hooks/createSettingsHandlers.js';

test('the memory switch survives a save round trip', () => {
  const defaults = createDefaultSettingsRecords();
  assert.equal(defaults.memory[0].id, 'memory-qdrant');
  assert.equal(defaults.memory[0].enabled, true);
  // Knowledge 页已下线：设置记录里不再有 knowledge 段。
  assert.equal(defaults.knowledge, undefined);

  const off = {
    ...defaults,
    memory: defaults.memory.map((record) => ({ ...record, enabled: false })),
  };
  assert.equal(buildMemorySettingsPayload(off).enabled, false);
  assert.deepEqual(buildMemorySettingsPayload(off).qdrant, {
    url: '',
    collection: { name: '', vector_size: 1024, distance: 'cosine' },
  });

  const restored = applyMemorySettingsPayloadToRecords(off, {
    enabled: false,
    qdrant: { url: 'http://host:6333', collection: { name: 'docs', vector_size: 768, distance: 'dot' } },
  });
  assert.equal(restored.memory[0].enabled, false);
  assert.equal(restored.memory[0].qdrant.url, 'http://host:6333');
  assert.equal(restored.memory[0].qdrant.collection.vector_size, 768);

  // A runtime that predates the switch leaves it on rather than off.
  const legacy = applyMemorySettingsPayloadToRecords(defaults, {});
  assert.equal(legacy.memory[0].enabled, true);
});

test('a stored draft that still lists knowledge records ignores that section', (t) => {
  const previousWindow = globalThis.window;
  const stored = {
    memory: [],
    knowledge: [{ id: 'knowledge-qdrant', enabled: false, qdrant: { url: 'http://stale:6333' } }],
  };
  globalThis.window = {
    localStorage: {
      getItem: (key) => (key === SETTINGS_RECORDS_STORAGE_KEY ? JSON.stringify(stored) : null),
    },
  };
  t.after(() => { globalThis.window = previousWindow; });

  const records = loadSettingsRecordsDraft();

  assert.equal(records.knowledge, undefined);
  assert.equal(records.memory.length, 1);
  assert.equal(records.memory[0].id, 'memory-qdrant');
  assert.equal(records.memory[0].qdrant.url, '');
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
