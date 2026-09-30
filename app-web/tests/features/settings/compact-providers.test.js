import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { normalizeCompactDraft, createCompactProviderDraft, compactThinkingOptions, SETTINGS_REASONING_OPTIONS, applyLlmSettingsPayloadToDraft, llmDraftForStorage } from '../../../src/features/settings/model/llm-settings.js';
import { configItemsForSection, getSelectedLlmConfig, updateSelectedLlmConfig, llmProviderRequestPayload } from '../../../src/features/settings/model/settings-payload.js';
import { createSettingsHandlers } from '../../../src/features/settings/hooks/createSettingsHandlers.js';
import { SETTINGS_SECTIONS } from '../../../src/features/settings/model/settings-navigation.js';

const row = (id, enabled = false) => ({ id, enabled, provider: 'custom', model: 'deepseek-v4-flash', name: id, base_url: 'https://router.test/v1', reasoning_effort: 'high', thinking: 'auto' });

test('Compact appears under Context and normalizes to a single enabled entry', () => {
  assert.ok(SETTINGS_SECTIONS.find(s => s.id === 'context').children.some(s => s.id === 'compact'));
  const compact = normalizeCompactDraft({ providers: [row('a', true), row('b', true)] });
  assert.deepEqual(compact.providers.map(p => p.enabled), [true, false]);
  assert.deepEqual(normalizeCompactDraft({}), { providers: [] });
  assert.equal(normalizeCompactDraft({ providers: [null, row('filtered')] }).providers[0].id, 'filtered');
  assert.equal(createCompactProviderDraft().enabled, false);
});

test('Compact rows, selected config and patches are isolated from Chat and Vision', () => {
  const draft = { chat: { model: 'main' }, vision: { providers: [] }, compact: { providers: [row('a')] }, profiles: [] };
  assert.equal(configItemsForSection('compact', draft, {})[0].canToggle, true);
  assert.equal(getSelectedLlmConfig(draft, 'a').model, 'deepseek-v4-flash');
  let next;
  updateSelectedLlmConfig(update => { next = update(draft); }, 'a', { thinking: 'disabled' });
  assert.equal(next.compact.providers[0].thinking, 'disabled');
  assert.equal(next.chat.model, 'main');
  const payload = llmProviderRequestPayload(next.compact.providers[0], { providerType: 'compact' });
  assert.equal(payload.thinking, 'disabled');
  assert.equal(payload.reasoning_effort, 'high');
  assert.deepEqual(applyLlmSettingsPayloadToDraft(draft, { compact: { providers: [] } }).compact.providers, []);
});

test('Compact uses the same four generic thinking efforts as Chat for every model', () => {
  const efforts = SETTINGS_REASONING_OPTIONS.map(item => item.id);
  assert.deepEqual(efforts, ['low', 'medium', 'high', 'xhigh']);
  for (const model of ['deepseek-v4-flash', 'glm-5.3', 'gpt-4o', 'gpt-5.5', 'o3', 'unknown']) {
    assert.deepEqual(compactThinkingOptions({ model }), { modes: ['auto'], efforts });
    for (const reasoning_effort of efforts) {
      const config = normalizeCompactDraft({ providers: [{ ...row('a'), model, reasoning_effort }] }).providers[0];
      assert.equal(config.reasoning_effort, reasoning_effort);
      assert.equal(llmProviderRequestPayload(config, { providerType: 'compact' }).reasoning_effort, reasoning_effort);
    }
  }
});

test('Compact editor shares Chat selector, removes On/Off and preserves effort on model change', () => {
  const source = readFileSync(new URL('../../../src/features/settings/components/LlmConfigEditor.jsx', import.meta.url), 'utf8');
  assert.ok(source.includes('const effortOptions = SETTINGS_REASONING_OPTIONS;'));
  assert.ok(source.includes("const showEffort = !isVisionProvider && selectedId !== 'embedding';"));
  assert.ok(!source.includes('compactThinkingOptions'));
  assert.ok(!source.includes('label="Thinking"'));
  assert.ok(!source.includes('Enable compact provider'));
  assert.ok(source.includes('{isVisionProvider && (\n        <SettingsToggleRow'));
  assert.ok(source.includes('update({ model });'));
  assert.ok(source.includes('update({ model: event.target.value })'));
  assert.ok(source.includes("update({ reasoning_effort, ...(isCompactProvider ? { thinking: 'auto' } : {}) })"));
});

test('Compact local storage excludes secrets but the backend receives them; save avoids other settings writes', async (t) => {
  const previousWindow = globalThis.window;
  const stored = [];
  globalThis.window = { localStorage: { setItem(key, value) { stored.push(value); } } };
  t.after(() => { globalThis.window = previousWindow; });
  const draft = { compact: { providers: [{ ...row('a'), api_key: 'secret-test', oauth_code: 'oauth-test' }] } };
  const serialized = llmDraftForStorage(draft);
  assert.ok(!serialized.includes('secret-test') && !serialized.includes('oauth-test'));
  const calls = [];
  const handlers = createSettingsHandlers({
    API_BASE: '', llmSettingsDraft: draft, settingsRecordsDraft: {}, applyLlmSettingsPayloadToDraft,
    setLlmSettingsDraft() {}, showToast() {},
    apiFetch: async (url, init) => {
      calls.push(url);
      assert.equal(JSON.parse(init.body).compact.providers[0].api_key, 'secret-test');
      return { ok: true, json: async () => ({ compact: { providers: [row('a')] } }) };
    },
  });
  assert.equal(await handlers.handleSaveSettingsDraft('compact'), true);
  assert.deepEqual(calls, ['/api/settings/llm']);
  assert.ok(stored.every(value => !value.includes('secret-test')));
});

test('Compact toggle saves one enabled provider without changing Vision', async (t) => {
  const previousWindow = globalThis.window;
  globalThis.window = { localStorage: { setItem() {} } };
  t.after(() => { globalThis.window = previousWindow; });
  const draft = { chat: {}, compact: { providers: [row('a', true), row('b')] }, vision: { providers: [row('v', true)] }, profiles: [] };
  let sent;
  let applied;
  const handlers = createSettingsHandlers({
    API_BASE: '', llmSettingsDraft: draft, applyLlmSettingsPayloadToDraft,
    setLlmSettingsDraft: update => { applied = update(draft); }, showToast() {},
    apiFetch: async (url, init) => {
      assert.equal(url, '/api/settings/llm');
      sent = JSON.parse(init.body);
      return { ok: true, json: async () => sent };
    },
  });
  assert.equal(await handlers.handleToggleLlmProvider('b', true), true);
  assert.deepEqual(sent.compact.providers.map(p => p.enabled), [false, true]);
  assert.equal(applied.vision.providers[0].enabled, true);
});
