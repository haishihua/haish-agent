import test from 'node:test';
import assert from 'node:assert/strict';
import { createSettingsHandlers } from '../../../src/features/settings/hooks/createSettingsHandlers.js';
import { createDefaultSettingsRecords } from '../../../src/features/settings/model/settings-records.js';
import { applyMemorySettingsPayloadToRecords, applyToolsSettingsPayloadToRecords, buildMemorySettingsPayload, buildToolsSettingsPayload } from '../../../src/features/settings/model/settings-payload.js';

for (const section of ['llm', 'embedding', 'compact', 'memory', 'tools']) {
  test(`${section} Save writes only its resource even when unrelated drafts have not loaded`, async t => {
    const previous = globalThis.window;
    const stored = [];
    globalThis.window = { localStorage: { setItem: (...args) => stored.push(args) } };
    t.after(() => { globalThis.window = previous; });
    const requests = [];
    const notices = [];
    const llm = { chat: { model: 'edited-model' } };
    let records = createDefaultSettingsRecords();
    const before = structuredClone(records);
    const llmSection = ['llm', 'embedding', 'compact'].includes(section);
    const resource = llmSection ? 'llm' : section;
    let clearedMemoryStatus = 0;
    let invalidations = 0;
    const handlers = createSettingsHandlers({
      API_BASE: '', skillConversationId: 'conversation-test', llmSettingsDraft: llm, settingsRecordsDraft: records,
      SETTINGS_RECORDS_STORAGE_KEY: 'records',
      buildMemorySettingsPayload, buildToolsSettingsPayload,
      applyMemorySettingsPayloadToRecords, applyToolsSettingsPayloadToRecords,
      beginLlmSettingsWrite: baseline => {
        assert.equal(llmSection, true);
        assert.equal(baseline, llm);
        assert.equal(stored.length, 0, 'the request draft must not be cached');
        return payload => {
          if (payload === undefined) return;
          assert.deepEqual(payload, llm);
          globalThis.window.localStorage.setItem('llm', JSON.stringify(payload));
        };
      },
      setSettingsRecordsDraft: update => { records = update(records); },
      invalidateSkillInventory: () => { invalidations += 1; },
      updateSettingsConnectionStatus: () => { clearedMemoryStatus += 1; },
      showToast: (...args) => notices.push(args),
      apiFetch: async (url, init) => {
        requests.push({ url, method: init.method, body: JSON.parse(init.body) });
        return { ok: true, json: async () => llmSection ? llm : resource === 'memory'
          ? { enabled: false, qdrant: { url: 'http://fixture-memory', collection: { name: 'fixture' } } }
          : { mcp: { config: { servers: { fixture: {} } } }, skills: { items: [] } } };
      },
    });
    assert.equal(await handlers.handleSaveSettingsDraft(section), true);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, `/api/settings/${resource}${section === 'tools' ? '?conversation_id=conversation-test' : ''}`);
    assert.equal(requests[0].method, 'PUT');
    assert.deepEqual(requests[0].body, llmSection ? llm : section === 'memory' ? buildMemorySettingsPayload(before) : buildToolsSettingsPayload(before));
    assert.equal(stored.length, 1);
    assert.equal(stored[0][0], llmSection ? 'llm' : 'records');
    assert.deepEqual(records[section === 'memory' ? 'tools' : 'memory'], before[section === 'memory' ? 'tools' : 'memory']);
    assert.equal(clearedMemoryStatus, section === 'memory' ? 1 : 0);
    assert.equal(invalidations, section === 'tools' ? 1 : 0);
    assert.equal(notices.at(-1)[0], 'success');
  });
}

test('missing or unsupported save sections cannot fall through into a multi-resource write', async () => {
  const errors = [];
  const handlers = createSettingsHandlers({ apiFetch: () => assert.fail('must not write'), showToast: (...args) => errors.push(args) });
  for (const section of [undefined, '', 'agent', 'workflow', 'unknown']) {
    assert.equal(await handlers.handleSaveSettingsDraft(section), false);
  }
  assert.equal(errors.length, 5);
  assert.ok(errors.every(([kind, message]) => kind === 'error' && message === 'invalid settings save section'));
});

for (const section of ['llm', 'embedding', 'compact', 'memory', 'tools']) {
  test(`${section} failure does not apply responses or report success`, async t => {
    const previous = globalThis.window;
    globalThis.window = { localStorage: { setItem() {} } };
    t.after(() => { globalThis.window = previous; });
    const notices = [];
    const requests = [];
    const handlers = createSettingsHandlers({
      API_BASE: '', settingsRecordsDraft: createDefaultSettingsRecords(), llmSettingsDraft: {},
      buildMemorySettingsPayload, buildToolsSettingsPayload,
      apiFetch: async url => { requests.push(url); return { ok: false, status: 503 }; },
      parseResponseMessage: async () => 'fixture failure', showToast: (...args) => notices.push(args),
      beginLlmSettingsWrite: () => payload => { assert.equal(payload, undefined, 'failed writes release hydration without publishing'); },
      setSettingsRecordsDraft: () => assert.fail('failed save'),
    });
    assert.equal(await handlers.handleSaveSettingsDraft(section), false);
    assert.equal(requests.length, 1);
    assert.deepEqual(notices, [['error', 'fixture failure']]);
  });
}
