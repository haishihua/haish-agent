import test from 'node:test';
import assert from 'node:assert/strict';
import { providerAuthBadge, runtimeLlmProviderOptions } from '../../../src/features/settings/model/llm-settings.js';
import { configItemsForSection } from '../../../src/features/settings/model/settings-payload.js';

const draft = {
  chat: { id: 'openai-api', provider: 'openai', model: 'gpt', auth_mode: 'api_key' },
  profiles: [
    { id: 'openai-oauth', provider: 'openai', model: 'gpt', auth_mode: 'oauth' },
    { id: 'xai-api', provider: 'xai', model: 'grok' },
    { id: 'xai-oauth', provider: 'xai', model: 'grok', auth_mode: 'oauth' },
    { id: 'router', provider: 'custom', name: 'OpenAI', auth_mode: 'api_key' },
    { id: 'deepseek-route', provider: 'deepseek', auth_mode: 'api_key' },
  ],
  vision: { providers: [{ id: 'vision', provider: 'openai', auth_mode: 'oauth' }] },
  compact: { providers: [{ id: 'compact', provider: 'xai', auth_mode: 'api_key' }] },
  image: { providers: [{ id: 'image', provider: 'openai', auth_mode: 'api_key' }] },
  embedding: { id: 'embedding-id', enabled: true, provider: 'openai', auth_mode: 'api_key' },
};

test('labels only actual API/OAuth modes of providers supporting both', () => {
  assert.equal(providerAuthBadge('OpenAI', ' API-KEY '), 'API');
  assert.equal(providerAuthBadge('xai', ' OAuth '), 'OAuth');
  assert.equal(providerAuthBadge('openai', undefined), 'API');
  for (const [provider, mode] of [['deepseek', 'api_key'], ['custom', 'oauth'], ['ollama', 'none'], ['unknown', 'api_key'], ['openai', 'none'], ['openai', 'unknown']]) {
    assert.equal(providerAuthBadge(provider, mode), '');
  }
});

test('settings lists carry the actual auth label across all provider sections', () => {
  const rows = configItemsForSection('llm', draft, {}, 'chat');
  assert.deepEqual(rows.map(row => [row.title, row.badge]), [
    ['OpenAI', 'API'], ['OpenAI', 'OAuth'], ['xAI', 'API'], ['xAI', 'OAuth'], ['OpenAI', ''], ['DeepSeek', ''],
  ]);
  assert.equal(configItemsForSection('llm', draft, {}, 'vision')[0].badge, 'OAuth');
  assert.equal(configItemsForSection('llm', draft, {}, 'image')[0].badge, 'API');
  assert.equal(configItemsForSection('compact', draft, {})[0].badge, 'API');
  assert.equal(configItemsForSection('embedding', draft, {})[0].badge, 'API');
});

test('runtime options keep distinct identities and their auth modes', () => {
  const options = runtimeLlmProviderOptions(draft);
  assert.deepEqual(options.map(option => [option.id, providerAuthBadge(option.provider, option.authMode)]), [
    ['openai-api', 'API'], ['openai-oauth', 'OAuth'], ['xai-api', 'API'], ['xai-oauth', 'OAuth'], ['router', ''], ['deepseek-route', ''],
  ]);
  assert.equal(options[0].requestProvider, 'openai-api');
  assert.equal(options[1].requestProvider, 'openai-oauth');
});
