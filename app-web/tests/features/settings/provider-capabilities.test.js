import test from 'node:test';
import assert from 'node:assert/strict';
import { LLM_PROVIDER_MODELS, getLlmProvider, getProviderCapabilities } from '../../../src/core/provider-catalog.js';
import {
  applyLlmSettingsPayloadToDraft,
  configuredModelOptions,
  modelChoicesFor,
  normalizeVisionDraft,
  runtimeLlmProviderOptions,
  runtimeProviderLabel,
} from '../../../src/features/settings/model/llm-settings.js';

// 表里只登记偏离默认的 provider，未登记的一律取这份默认能力。
const DEFAULT_CAPABILITIES = {
  hasPresetModels: true,
  exposesModelOptions: true,
  requiresBaseUrl: false,
  defaultAuthMode: 'api_key',
};

// 走一遍 runtime 选项，拿到某个 provider 配置真正下发给运行时的形状。
const runtimeOption = (config) => runtimeLlmProviderOptions({ chat: { id: 'main', model: 'model', ...config } })[0];
const visionAuthMode = (provider, authMode) => normalizeVisionDraft({
  providers: [{ id: 'vision', provider, ...(authMode === undefined ? {} : { auth_mode: authMode }) }],
}).providers[0].auth_mode;

test('capability table registers custom and ollama, everything else keeps the defaults', () => {
  assert.deepEqual(getProviderCapabilities('custom'), {
    hasPresetModels: false,
    exposesModelOptions: true,
    requiresBaseUrl: true,
    defaultAuthMode: 'api_key',
  });
  assert.deepEqual(getProviderCapabilities('ollama'), {
    hasPresetModels: false,
    exposesModelOptions: false,
    requiresBaseUrl: false,
    defaultAuthMode: 'none',
  });
  for (const provider of ['openai', 'unknown', '', undefined, null, 'toString', '__proto__']) {
    assert.deepEqual(getProviderCapabilities(provider), DEFAULT_CAPABILITIES);
  }
});

test('custom keeps no preset models but still lists what discovery cached', () => {
  assert.deepEqual(modelChoicesFor('custom'), []);
  const discovered = [{ id: 'relay-model' }];
  assert.deepEqual(configuredModelOptions({ provider: 'custom', model_options: discovered }), discovered);
});

test('custom takes its base URL, protocol and display name from the user', () => {
  const row = runtimeOption({ provider: 'custom', name: ' Relay ', base_url: ' https://relay.invalid/v1 ', protocol: 'anthropic' });
  assert.equal(row.customProvider, 'Relay');
  assert.equal(row.baseUrl, 'https://relay.invalid/v1');
  assert.equal(row.protocol, 'anthropic');
  assert.equal(runtimeOption({ provider: 'custom' }).protocol, 'openai');
  assert.equal(runtimeProviderLabel({ provider: 'custom', name: 'Relay' }), 'Relay');
  assert.equal(runtimeProviderLabel({ provider: 'custom' }), getLlmProvider('custom').label);
  const legacy = applyLlmSettingsPayloadToDraft({}, { chat: { provider: 'custom', custom_provider: 'Relay' } });
  assert.equal(legacy.chat.name, 'Relay');
});

test('custom defaults to api_key authentication', () => {
  assert.equal(visionAuthMode('custom'), 'api_key');
});

test('ollama exposes no model list at all', () => {
  assert.deepEqual(modelChoicesFor('ollama'), []);
  assert.deepEqual(configuredModelOptions({ provider: 'ollama', model_options: [{ id: 'qwen3-vl' }] }), []);
});

test('ollama neither carries a base URL nor emits protocol and custom name fields', () => {
  const row = runtimeOption({ provider: 'ollama', name: 'ignored', base_url: 'http://127.0.0.1:11434/v1', protocol: 'anthropic' });
  assert.equal(row.customProvider, '');
  assert.equal(row.baseUrl, '');
  assert.equal('protocol' in row, false);
  assert.equal(runtimeProviderLabel({ provider: 'ollama', name: 'ignored' }), getLlmProvider('ollama').label);
});

test('ollama defaults to no authentication but keeps an explicit choice', () => {
  assert.equal(visionAuthMode('ollama'), 'none');
  assert.equal(visionAuthMode('ollama', 'oauth'), 'oauth');
});

test('an unregistered provider falls back to the documented defaults', () => {
  assert.deepEqual(modelChoicesFor('openai'), LLM_PROVIDER_MODELS.openai);
  assert.deepEqual(modelChoicesFor('not-a-provider'), []);
  const discovered = [{ id: 'kept' }];
  assert.deepEqual(configuredModelOptions({ provider: 'unknown', model_options: discovered }), discovered);
  const row = runtimeOption({ provider: 'unknown', name: 'ignored', base_url: 'https://unknown.invalid/v1', protocol: 'anthropic' });
  assert.equal(row.customProvider, '');
  assert.equal(row.baseUrl, '');
  assert.equal('protocol' in row, false);
  assert.equal(visionAuthMode('unknown'), 'api_key');
  // 未登记的 provider 不回填显示名：custom_provider 只是 custom 的旧字段。
  assert.equal(applyLlmSettingsPayloadToDraft({}, { chat: { provider: 'unknown', custom_provider: 'Relay' } }).chat.name, undefined);
});
