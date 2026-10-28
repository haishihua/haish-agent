import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SETTINGS_LLM_PROVIDER_OPTIONS,
  getLlmProvider,
  nextProviderDraft,
  modelChoicesFor,
  llmModelCatalogPatch,
  applyLlmSettingsPayloadToDraft,
  llmDraftForStorage,
  loadLlmSettingsDraft,
  runtimeLlmProviderOptions,
} from '../../../src/features/settings/model/llm-settings.js';
import {
  getSelectedLlmConfig,
  llmEditorModelChoices,
  llmProviderRequestPayload,
} from '../../../src/features/settings/model/settings-payload.js';
import { createSettingsHandlers } from '../../../src/features/settings/hooks/createSettingsHandlers.js';

const custom = {
  id: 'native-relay', provider: 'custom', auth_mode: 'api_key', protocol: 'anthropic',
  name: 'Native relay', custom_provider: 'Native relay', base_url: 'https://fixture.invalid/v1',
  model: 'claude-sonnet-5-5', custom_model_ids: ['anthropic/claude-opus-5-5'],
};

test('Settings offers Anthropic with API key authentication and keeps Gemini hidden', () => {
  const provider = SETTINGS_LLM_PROVIDER_OPTIONS.find(item => item.id === 'anthropic');
  assert.ok(provider);
  assert.equal(provider.label, 'Anthropic');
  assert.deepEqual(provider.authModes, ['api_key']);
  assert.equal(provider.defaultAuth, 'api_key');
  assert.equal(provider.baseUrl, 'https://api.anthropic.com/v1');
  assert.equal(SETTINGS_LLM_PROVIDER_OPTIONS.some(item => item.id === 'gemini'), false);
  const next = nextProviderDraft('anthropic', { ...custom, api_key: 'fixture-key' });
  assert.equal(next.provider, 'anthropic');
  assert.equal(next.auth_mode, 'api_key');
  assert.equal(next.model, provider.defaultModel);
  assert.equal(next.base_url, provider.baseUrl);
  assert.equal(next.api_key, '');
  assert.equal(next.protocol, undefined);
  assert.ok(modelChoicesFor('anthropic').includes(provider.defaultModel));
});

test('switching providers clears the old custom wire protocol', () => {
  assert.equal(nextProviderDraft('custom', custom).protocol, 'openai');
  assert.equal(nextProviderDraft('openai', custom).protocol, undefined);
});

test('custom discovery and connection-test payloads carry the declared native protocol', () => {
  const payload = llmProviderRequestPayload({ ...custom, api_key: 'fixture-key' }, { includeSecret: true, refresh: true });
  assert.equal(payload.provider, 'custom');
  assert.equal(payload.protocol, 'anthropic');
  assert.equal(payload.model, custom.model);
  assert.equal(payload.base_url, custom.base_url);
  assert.equal(payload.api_key, 'fixture-key');
  assert.deepEqual(payload.custom_model_ids, custom.custom_model_ids);
  assert.equal(llmProviderRequestPayload({ provider: 'custom' }).protocol, 'openai');
  assert.equal('protocol' in llmProviderRequestPayload({ provider: 'anthropic', protocol: 'openai' }), false);
});

test('Claude model IDs survive discovery, save readback, storage and runtime options', t => {
  const patch = llmModelCatalogPatch(custom, {
    models: [{ id: 'anthropic/claude-opus-5-5', label: 'Relay Opus' }],
    default_model: 'anthropic/claude-opus-5-5',
  });
  const edited = { ...custom, ...patch };
  assert.equal(edited.model, custom.model);
  assert.deepEqual(new Set(llmEditorModelChoices(edited).map(item => item.id)), new Set([custom.model, ...custom.custom_model_ids]));
  const native = { id: 'official-anthropic', ...nextProviderDraft('anthropic') };
  const saved = applyLlmSettingsPayloadToDraft({}, {
    chat: native, profiles: [edited],
    vision: { providers: [{ ...custom, id: 'native-vision', enabled: true }] },
    compact: { providers: [{ ...custom, id: 'native-compact', enabled: true }] },
  });
  assert.equal(saved.profiles[0].protocol, 'anthropic');
  assert.equal(saved.vision.providers[0].protocol, 'anthropic');
  assert.equal(saved.compact.providers[0].protocol, 'anthropic');
  const previous = globalThis.window;
  globalThis.window = { localStorage: { getItem: () => llmDraftForStorage(saved) } };
  t.after(() => { globalThis.window = previous; });
  const restored = loadLlmSettingsDraft();
  const options = runtimeLlmProviderOptions(restored);
  assert.equal(options[0].provider, 'anthropic');
  assert.equal(options[0].defaultModelId, getLlmProvider('anthropic').defaultModel);
  assert.equal(options[1].protocol, 'anthropic');
  assert.equal(options[1].defaultModelId, custom.model);
  assert.equal(options[1].requestProvider, custom.id);
  assert.equal(options[1].baseUrl, custom.base_url);
  assert.deepEqual(options[1].customModelIds, custom.custom_model_ids);
  const [legacy] = runtimeLlmProviderOptions({ chat: { ...custom, protocol: undefined } });
  assert.equal(legacy.protocol, 'openai');
});

for (const providerType of ['chat', 'vision', 'compact']) {
  test(`${providerType} save and connection test preserve custom Anthropic routing without real HTTP`, async () => {
    const entry = { ...custom, id: `native-${providerType}`, api_key: 'fixture-key' };
    const draft = {
      chat: providerType === 'chat' ? entry : {},
      [providerType === 'chat' ? 'profiles' : providerType]: providerType === 'chat' ? [] : { providers: [entry] },
    };
    const requests = [];
    const notices = [];
    let readback;
    const handlers = createSettingsHandlers({
      API_BASE: '', llmSettingsDraft: draft, getSelectedLlmConfig, llmProviderRequestPayload,
      beginLlmSettingsWrite: () => payload => { if (payload) readback = applyLlmSettingsPayloadToDraft({}, payload); },
      apiFetch: async (url, init) => {
        requests.push({ url, method: init.method, body: JSON.parse(init.body) });
        return { ok: true, json: async () => url.endsWith('/test') ? { ok: true } : draft };
      },
      showToast: (...args) => notices.push(args),
    });
    assert.equal(await handlers.handleSaveSettingsDraft(providerType === 'compact' ? 'compact' : 'llm'), true);
    const selectedId = providerType === 'chat' ? 'chat' : entry.id;
    assert.equal(getSelectedLlmConfig(readback, selectedId).protocol, 'anthropic');
    await handlers.handleTestLlmConfig(selectedId);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].url, '/api/settings/llm');
    assert.equal(requests[0].method, 'PUT');
    assert.equal(getSelectedLlmConfig(requests[0].body, selectedId).protocol, 'anthropic');
    assert.equal(requests[1].url, '/api/llm/test');
    assert.equal(requests[1].method, 'POST');
    assert.equal(requests[1].body.protocol, 'anthropic');
    assert.equal(requests[1].body.model, custom.model);
    assert.equal(requests[1].body.provider_type, providerType);
    assert.equal(requests[1].body.api_key, 'fixture-key');
    assert.ok(notices.every(([kind]) => kind === 'success'));
  });
}
