import assert from 'node:assert/strict';
import test from 'node:test';

const values = new Map();
globalThis.window = {
  localStorage: {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  },
};

const { buildRunConfigStorageKey, stableHash } = await import('../../../src/shared/api/client.js');
const {
  firstRunProvider,
  resolveRunConfigSelection,
  safeWriteRunConfigSelection,
} = await import('../../../src/features/chat/hooks/useRunConfig.js');

const providers = [{ id: 'ai-router', defaultModelId: 'gpt-5.6-sol' }];
const agents = [{ id: 'agent-default' }];

test('new conversations inherit the owner-scoped preferred run config', () => {
  values.clear();
  const ownerId = 'owner-1';
  const key = buildRunConfigStorageKey(ownerId, 'chat', 'conversation-new');
  const preferredKey = `haish_preferred_run_config_v1:${stableHash(ownerId)}:${stableHash('chat')}`;
  safeWriteRunConfigSelection(preferredKey, {
    agentId: 'agent-default',
    modelId: 'gpt-5.6-sol',
    providerId: 'ai-router',
    providerDefaultModelId: 'gpt-5.6-sol',
    reasoningEffort: 'high',
  });

  assert.deepEqual(
    resolveRunConfigSelection(key, providers, agents, 'agent-default'),
    {
      agentId: 'agent-default',
      modelId: 'gpt-5.6-sol',
      providerId: 'ai-router',
      providerDefaultModelId: 'gpt-5.6-sol',
      reasoningEffort: 'high',
    },
  );
});

test('run config keys require owner, mode, and conversation', () => {
  assert.equal(buildRunConfigStorageKey('', 'chat', 'conversation'), '');
  assert.equal(buildRunConfigStorageKey('owner', 'chat', ''), '');
});

test('brand-new conversations use provider order instead of hard-coding xAI', () => {
  assert.equal(firstRunProvider([
    { id: 'ai-router', provider: 'openai_compatible' },
    { id: 'xai', provider: 'xai' },
  ]).id, 'ai-router');
});
