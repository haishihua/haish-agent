import test from 'node:test';
import assert from 'node:assert/strict';

// useRunConfig 经 shared/api/base.js 在模块顶层读 window.HAISH_API_BASE，所以先把
// 运行时的 window 垫好再动态 import；localStorage 由这个假壳提供。
const STORAGE_KEY = 'haish_run_config_v1:ownerhash:modehash:convhash';
const store = new Map();
globalThis.window = {
  HAISH_API_BASE: '',
  localStorage: {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, value),
  },
};

const { storedRunConfigRequest } = await import('../../../src/features/chat/hooks/useRunConfig.js');

// 形状取自 settings/model/llm-settings.js 的 runtimeLlmProviderOptions：
// id 是选择器的 key，requestProvider 才是发给后端的那串选择器（profile id / custom:xxx）。
const PROVIDERS = [
  { id: 'chat:generic', provider: 'generic', requestProvider: 'generic', defaultModelId: 'old-model' },
  { id: 'llm-profile-1695', provider: 'custom', requestProvider: 'llm-profile-1695', defaultModelId: 'deepseek-v4-flash' },
];

function withStoredSelection(raw, run) {
  store.clear();
  if (raw !== undefined) store.set(STORAGE_KEY, typeof raw === 'string' ? raw : JSON.stringify(raw));
  try {
    return run();
  } finally {
    store.clear();
  }
}

test('a stored selection becomes the retry run config with its request selector', () => {
  const config = withStoredSelection({
    agentId: 'preset.chat',
    providerId: 'llm-profile-1695',
    modelId: 'deepseek-v4-flash',
    providerDefaultModelId: 'deepseek-v4-flash',
    reasoningEffort: 'xhigh',
  }, () => storedRunConfigRequest(STORAGE_KEY, PROVIDERS));
  assert.deepEqual(config, {
    provider: 'llm-profile-1695',
    modelId: 'deepseek-v4-flash',
    reasoningEffort: 'xhigh',
  });
});

test('a stale reasoning level uses the high runtime default', () => {
  const config = withStoredSelection({
    providerId: 'chat:generic',
    modelId: 'old-model',
    reasoningEffort: 'not-a-level',
  }, () => storedRunConfigRequest(STORAGE_KEY, PROVIDERS));
  assert.deepEqual(config, {
    provider: 'generic',
    modelId: 'old-model',
    reasoningEffort: 'high',
  });
});

test('nothing stored for the conversation returns no configuration', () => {
  assert.equal(withStoredSelection(undefined, () => storedRunConfigRequest(STORAGE_KEY, PROVIDERS)), null);
  assert.equal(withStoredSelection('{not json', () => storedRunConfigRequest(STORAGE_KEY, PROVIDERS)), null);
  assert.equal(withStoredSelection({ providerId: 'chat:generic' }, () => storedRunConfigRequest(STORAGE_KEY, PROVIDERS)), null);
});

test('a provider that is no longer in the catalog is not replaced by the first one', () => {
  const config = withStoredSelection({
    providerId: 'llm-profile-removed',
    modelId: 'deepseek-v4-flash',
    reasoningEffort: 'low',
  }, () => storedRunConfigRequest(STORAGE_KEY, PROVIDERS));
  assert.equal(config, null);
});
