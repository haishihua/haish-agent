import test from 'node:test';
import assert from 'node:assert/strict';
import { applyToolsSettingsPayloadToRecords } from '../../../src/features/settings/model/settings-payload.js';
import { createSettingsHandlers } from '../../../src/features/settings/hooks/createSettingsHandlers.js';

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
