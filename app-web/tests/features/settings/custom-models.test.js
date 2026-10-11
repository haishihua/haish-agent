import test from 'node:test';
import assert from 'node:assert/strict';
import { addCustomModelId, customModelIds, llmModelCatalogPatch, runtimeLlmProviderOptions, nextProviderDraft, applyLlmSettingsPayloadToDraft } from '../../../src/features/settings/model/llm-settings.js';
import { llmEditorModelChoices, llmProviderRequestPayload, updateSelectedLlmConfig } from '../../../src/features/settings/model/settings-payload.js';

const config = { provider: 'zhipu', auth_mode: 'api_key', model: 'glm-5.3-flash', model_options: [{ id: 'glm-5.3-flash', label: 'GLM Flash' }] };
const ids = choices => choices.map(item => item.id);

test('Model ID adds a provider option without changing the default', () => {
  const added = { ...config, ...addCustomModelId(config, ' glm-4.7-flash ') };
  assert.equal(added.model, 'glm-5.3-flash');
  assert.deepEqual(customModelIds(added), ['glm-4.7-flash']);
  assert.deepEqual(ids(llmEditorModelChoices(added)), ['glm-5.3-flash', 'glm-4.7-flash']);
  assert.deepEqual(addCustomModelId(added, 'glm-4.7-flash'), { custom_model_ids: ['glm-4.7-flash'] });
  assert.deepEqual(addCustomModelId(added, '  '), {});
});

test('refresh unions additions without overwriting even an unenumerated default', () => {
  const current = { ...config, model: 'glm-4.7-flash', custom_model_ids: ['glm-4.7-flash', 'glm-extra'] };
  const patch = llmModelCatalogPatch(current, { models: config.model_options, default_model: 'glm-5.3-flash' });
  assert.equal('model' in patch, false);
  assert.deepEqual(ids(patch.choices), ['glm-5.3-flash', 'glm-4.7-flash', 'glm-extra']);
  assert.deepEqual(customModelIds({ ...current, ...patch }), current.custom_model_ids);
});

test('only an empty default is initialized from discovery', () => {
  const patch = llmModelCatalogPatch({ ...config, model: '', custom_model_ids: ['glm-extra'] }, { models: config.model_options, default_model: 'glm-5.3-flash' });
  assert.equal(patch.model, 'glm-5.3-flash');
  const offline = llmModelCatalogPatch({ ...config, custom_model_ids: ['glm-extra'] }, { models: [] });
  assert.equal('model' in offline, false);
  assert.deepEqual(ids(offline.choices), ['glm-extra', 'glm-5.3-flash']);
});

test('removing an addition does not keep it in the discovery cache', () => {
  const added = { ...config, custom_model_ids: ['glm-extra'] };
  const patch = llmModelCatalogPatch(added, { models: [...config.model_options, { id: 'glm-extra' }] });
  const removed = { ...added, ...patch, custom_model_ids: [] };
  assert.deepEqual(ids(llmEditorModelChoices(removed)), ['glm-5.3-flash']);
});

test('additions survive save readback and reach runtime discovery requests', () => {
  const added = { ...config, id: 'zhipu-profile', custom_model_ids: ['glm-4.7-flash'] };
  const restored = applyLlmSettingsPayloadToDraft({}, { chat: {}, profiles: [added] });
  const [option] = runtimeLlmProviderOptions(restored);
  assert.equal(option.defaultModelId, 'glm-5.3-flash');
  assert.deepEqual(option.customModelIds, ['glm-4.7-flash']);
  assert.deepEqual(ids(option.modelOptions), ['glm-5.3-flash', 'glm-4.7-flash']);
  assert.deepEqual(llmProviderRequestPayload(restored.profiles[0]).custom_model_ids, ['glm-4.7-flash']);
});

test('supplemental options stay scoped to the selected provider configuration', () => {
  let draft = { chat: {}, profiles: [{ ...config, id: 'a' }, { ...config, id: 'b' }] };
  updateSelectedLlmConfig(updater => { draft = updater(draft); }, 'a', addCustomModelId(config, 'glm-extra'));
  assert.deepEqual(customModelIds(draft.profiles[0]), ['glm-extra']);
  assert.deepEqual(customModelIds(draft.profiles[1]), []);
  assert.deepEqual(nextProviderDraft('deepseek', draft.profiles[0]).custom_model_ids, []);
});
