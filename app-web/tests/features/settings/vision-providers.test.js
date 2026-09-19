import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LLM_SETTINGS_STORAGE_KEY,
  applyLlmSettingsPayloadToDraft,
  loadLlmSettingsDraft,
  normalizeVisionDraft,
  setVisionProviderEnabled,
} from '../../../src/features/settings/model/llm-settings.js';
import {
  configItemsForSection,
  getSelectedLlmConfig,
  updateSelectedLlmConfig,
} from '../../../src/features/settings/model/settings-payload.js';
import { createSettingsHandlers } from '../../../src/features/settings/hooks/createSettingsHandlers.js';

test('a stored single-object vision draft migrates to one provider and keeps its state', (t) => {
  const previousWindow = globalThis.window;
  const stored = {
    chat: { provider: 'custom', model: 'chat-model' },
    vision: {
      enabled: true,
      mode: 'auto',
      provider: 'custom',
      auth_mode: 'api_key',
      name: 'SiliconFlow',
      model: 'Qwen/Qwen3-VL-32B-Instruct',
      base_url: 'https://api.siliconflow.cn/v1',
    },
  };
  globalThis.window = {
    localStorage: {
      getItem: (key) => (key === LLM_SETTINGS_STORAGE_KEY ? JSON.stringify(stored) : null),
    },
  };
  t.after(() => { globalThis.window = previousWindow; });

  const draft = loadLlmSettingsDraft();

  assert.deepEqual(draft.vision, {
    mode: 'auto',
    providers: [
      {
        id: 'vision-1',
        enabled: true,
        provider: 'custom',
        auth_mode: 'api_key',
        custom_provider: '',
        name: 'SiliconFlow',
        model: 'Qwen/Qwen3-VL-32B-Instruct',
        base_url: 'https://api.siliconflow.cn/v1',
        model_options: [],
      },
    ],
  });
});

test('only the first enabled vision provider survives normalization', () => {
  const normalized = normalizeVisionDraft({
    mode: 'auto',
    providers: [
      { id: 'a', enabled: true, provider: 'openai', model: 'gpt-5.5' },
      { id: 'b', enabled: true, provider: 'ollama', model: 'qwen3-vl' },
    ],
  });
  assert.deepEqual(normalized.providers.map((provider) => provider.enabled), [true, false]);

  const fresh = normalizeVisionDraft({
    providers: [{ id: 'c', provider: 'custom', name: 'custom-router' }],
  });
  assert.equal(fresh.providers[0].enabled, false);

  assert.deepEqual(normalizeVisionDraft({}), { mode: 'auto', providers: [] });
});

test('setVisionProviderEnabled releases the previously enabled provider', () => {
  const vision = {
    mode: 'auto',
    providers: [
      { id: 'a', enabled: true, provider: 'openai', model: 'gpt-5.5' },
      { id: 'b', enabled: false, provider: 'ollama', model: 'qwen3-vl' },
    ],
  };

  const enabled = setVisionProviderEnabled(vision, 'b', true);
  assert.deepEqual(enabled.providers.map((provider) => provider.enabled), [false, true]);

  const disabled = setVisionProviderEnabled(enabled, 'b', false);
  assert.deepEqual(disabled.providers.map((provider) => provider.enabled), [false, false]);
});

test('vision list rows expose the switch state and their own entry id', () => {
  const draft = {
    chat: {},
    vision: {
      mode: 'auto',
      providers: [
        { id: 'vision-7', enabled: true, provider: 'custom', name: 'router', model: 'mimo-v2.5' },
        { id: 'vision-8', enabled: false, provider: 'openai', model: 'gpt-5.5' },
      ],
    },
    embedding: {},
    profiles: [],
  };

  const items = configItemsForSection('llm', draft, {}, 'vision');

  assert.deepEqual(items.map((item) => [item.id, item.enabled, item.canToggle]), [
    ['vision-7', true, true],
    ['vision-8', false, true],
  ]);
  assert.equal(items[0].summary, 'mimo-v2.5');
  assert.equal(items[0].kind, 'Vision Provider');
});

test('the editor reads and patches vision entries by id', () => {
  const draft = {
    chat: {},
    vision: {
      mode: 'auto',
      providers: [
        { id: 'vision-1', enabled: true, provider: 'custom', name: 'first', model: 'm1' },
        { id: 'vision-2', enabled: false, provider: 'openai', model: 'm2' },
      ],
    },
    embedding: {},
    profiles: [],
  };

  assert.equal(getSelectedLlmConfig(draft, 'vision-2').model, 'm2');

  let next = null;
  updateSelectedLlmConfig((update) => { next = update(draft); }, 'vision-2', { model: 'm3' });

  assert.equal(next.vision.providers[1].model, 'm3');
  assert.equal(next.vision.providers[1].id, 'vision-2');
  assert.equal(next.vision.providers[0].model, 'm1');
  assert.deepEqual(next.profiles, []);
});

test('toggling a vision provider saves the collapsed draft immediately', async (t) => {
  const previousWindow = globalThis.window;
  globalThis.window = { localStorage: { setItem() {} } };
  t.after(() => { globalThis.window = previousWindow; });
  const draft = {
    chat: {},
    vision: {
      mode: 'auto',
      providers: [
        { id: 'a', enabled: true, provider: 'custom', name: 'A', model: 'm1' },
        { id: 'b', enabled: false, provider: 'openai', model: 'm2' },
      ],
    },
    embedding: {},
    profiles: [],
  };
  let sent = null;
  let applied = null;
  const notices = [];
  const handlers = createSettingsHandlers({
    API_BASE: '',
    llmSettingsDraft: draft,
    applyLlmSettingsPayloadToDraft,
    parseResponseMessage: async () => 'update failed',
    showToast: (...args) => notices.push(args),
    setLlmSettingsDraft: (update) => { applied = update(draft); },
    apiFetch: async (url, init) => {
      assert.equal(url, '/api/settings/llm');
      assert.equal(init.method, 'PUT');
      sent = JSON.parse(init.body);
      return {
        ok: true,
        json: async () => ({
          chat: {},
          vision: {
            enabled: true,
            mode: 'auto',
            providers: [
              { id: 'a', enabled: false, provider: 'custom', model: 'm1' },
              { id: 'b', enabled: true, provider: 'openai', model: 'm2' },
            ],
          },
          embedding: {},
          profiles: [],
        }),
      };
    },
  });

  assert.equal(await handlers.handleToggleLlmProvider('b', true), true);

  assert.deepEqual(sent.vision.providers.map((provider) => provider.enabled), [false, true]);
  assert.deepEqual(applied.vision.providers.map((provider) => provider.enabled), [false, true]);
  assert.deepEqual(notices, [['success', 'vision provider enabled']]);
});

test('toggling an unknown vision provider id is ignored', async () => {
  const handlers = createSettingsHandlers({
    API_BASE: '',
    llmSettingsDraft: { chat: {}, vision: { mode: 'auto', providers: [] }, embedding: {}, profiles: [] },
    apiFetch: async () => assert.fail('unknown entry must not hit the settings API'),
    showToast() {},
  });

  assert.equal(await handlers.handleToggleLlmProvider('missing', true), false);
});

test('a failed vision toggle keeps the draft and reports the error', async (t) => {
  const previousWindow = globalThis.window;
  globalThis.window = { localStorage: { setItem() {} } };
  t.after(() => { globalThis.window = previousWindow; });
  const draft = {
    chat: {},
    vision: {
      mode: 'auto',
      providers: [{ id: 'a', enabled: true, provider: 'custom', name: 'A', model: 'm1' }],
    },
    embedding: {},
    profiles: [],
  };
  const notices = [];
  const handlers = createSettingsHandlers({
    API_BASE: '',
    llmSettingsDraft: draft,
    applyLlmSettingsPayloadToDraft,
    parseResponseMessage: async () => 'runtime unavailable',
    showToast: (...args) => notices.push(args),
    setLlmSettingsDraft: () => assert.fail('failed update must not replace the draft'),
    apiFetch: async () => ({ ok: false, status: 503 }),
  });

  assert.equal(await handlers.handleToggleLlmProvider('a', false), false);
  assert.deepEqual(notices, [['error', 'runtime unavailable']]);
});
