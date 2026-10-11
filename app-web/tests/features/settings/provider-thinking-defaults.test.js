import test from 'node:test';
import assert from 'node:assert/strict';
import { runtimeLlmProviderOptions, applyLlmSettingsPayloadToDraft, createCompactProviderDraft } from '../../../src/features/settings/model/llm-settings.js';
import { createLlmProfile } from '../../../src/features/settings/model/settings-payload.js';
import { REASONING_EFFORT_OPTIONS } from '../../../src/features/chat/model/run-catalog.js';

const row = (id, effort) => ({ id, provider: 'custom', name: id, model: `${id}-model`, reasoning_effort: effort });

test('each Settings provider exports its own explicit default model and thinking', () => {
  const rows = REASONING_EFFORT_OPTIONS.map(({ id }) => row(id, id));
  const draft = applyLlmSettingsPayloadToDraft({}, { chat: rows[0], profiles: rows.slice(1) });
  const options = runtimeLlmProviderOptions(draft);
  assert.deepEqual(options.map(({ defaultReasoningEffort }) => defaultReasoningEffort), REASONING_EFFORT_OPTIONS.map(({ id }) => id));
  assert.deepEqual(options.map(({ defaultModelId }) => defaultModelId), rows.map(({ model }) => model));
});

test('missing or retired Settings effort defaults to high', () => {
  for (const effort of [undefined, null, '', 'none', 'minimal', 'unknown']) {
    const [option] = runtimeLlmProviderOptions({ chat: row('p', effort) });
    assert.equal(option.defaultReasoningEffort, 'high');
  }
});

test('new main-model profiles and Compact share the original high default', () => {
  assert.equal(createLlmProfile().reasoning_effort, 'high');
  assert.equal(createCompactProviderDraft().reasoning_effort, 'high');
});
