import test from 'node:test';
import assert from 'node:assert/strict';
import { applyLlmSettingsPayloadToDraft, runtimeLlmProviderOptions, createVisionProviderDraft, createCompactProviderDraft, llmDraftForStorage } from '../../../src/features/settings/model/llm-settings.js';
import { createLlmProfile, llmProviderRequestPayload } from '../../../src/features/settings/model/settings-payload.js';

const row = (id, changes = {}) => ({ id, provider: 'custom', name: 'router', model: 'private-default', base_url: 'https://router.invalid/v1', auth_mode: 'api_key', ...changes });

test('runtime identity never uses provider, name, endpoint, model or position', () => {
  for (const id of [undefined, '', 'auto', 'custom', 'openai', 'chat', 'custom:router']) {
    assert.deepEqual(runtimeLlmProviderOptions({ chat: row(id) }), []);
  }
  const options = runtimeLlmProviderOptions({ profiles: [row('record-b'), row('record-a', { name: 'renamed', model: 'changed-default' })] });
  assert.deepEqual(options.map(option => option.id), ['record-b', 'record-a']);
  assert.equal(options[1].requestProvider, 'record-a');
  assert.equal(options[1].defaultModelId, 'changed-default');
});

test('duplicate ids across main and auxiliary sections are not execution options', () => {
  assert.deepEqual(runtimeLlmProviderOptions({ chat: row('same'), profiles: [row('same')] }), []);
  assert.deepEqual(runtimeLlmProviderOptions({ chat: row('same'), vision: { providers: [row('same')] } }), []);
});

test('new local drafts have editor identity but cannot claim a persisted execution identity', () => {
  const profile = { ...createLlmProfile(), model: 'private-draft', base_url: 'https://draft.invalid/v1', api_key: 'synthetic' };
  assert.ok(profile.id);
  assert.deepEqual(runtimeLlmProviderOptions({ profiles: [profile] }), []);
  for (const draft of [profile, createVisionProviderDraft(), createCompactProviderDraft()]) {
    assert.equal(llmProviderRequestPayload(draft, { includeSecret: true }).llm_config_id, undefined);
  }
  const cached = JSON.parse(llmDraftForStorage({ profiles: [profile] }));
  assert.deepEqual(runtimeLlmProviderOptions(cached), []);
  assert.equal(cached.profiles[0].api_key, undefined);
  const saved = applyLlmSettingsPayloadToDraft({}, { profiles: [{ ...profile, api_key: undefined }] });
  assert.equal(runtimeLlmProviderOptions(saved)[0].id, profile.id);
  assert.equal(llmProviderRequestPayload(saved.profiles[0]).llm_config_id, profile.id);
});

test('legacy auxiliary rows get only local editor ids until Settings returns saved ids', () => {
  const legacy = { provider: 'custom', model: 'private', enabled: true };
  const draft = applyLlmSettingsPayloadToDraft({}, { vision: legacy, compact: { providers: [legacy] } });
  for (const entry of [draft.vision.providers[0], draft.compact.providers[0]]) {
    assert.ok(entry.id);
    assert.equal(entry._persisted, false);
    assert.equal(llmProviderRequestPayload(entry).llm_config_id, undefined);
  }
  const saved = applyLlmSettingsPayloadToDraft(draft, { vision: { providers: [row('vision-record')] }, compact: { providers: [row('compact-record')] } });
  assert.equal(llmProviderRequestPayload(saved.vision.providers[0]).llm_config_id, 'vision-record');
  assert.equal(llmProviderRequestPayload(saved.compact.providers[0]).llm_config_id, 'compact-record');
});
