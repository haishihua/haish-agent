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

test('brand-new conversations do not invent a provider or model and start at high', () => {
  values.clear();
  const selection = resolveRunConfigSelection('fresh', providers, agents, 'agent-default');
  assert.equal(selection.providerId, '');
  assert.equal(selection.modelId, '');
  assert.equal(selection.reasoningEffort, 'high');
});

test('removed conversation provider is kept visible instead of replaced by preferred or first provider', () => {
  values.clear();
  safeWriteRunConfigSelection('removed', { providerId: 'gone', modelId: 'm', reasoningEffort: null });
  const selection = resolveRunConfigSelection('removed', providers, agents, 'agent-default');
  assert.equal(selection.providerId, 'gone');
  assert.equal(selection.modelId, 'm');
  assert.equal(selection.reasoningEffort, 'high');
});

test('legacy missing/none/null/minimal effort uses the selected provider default', () => {
  values.clear();
  const withDefault = [{ ...providers[0], defaultReasoningEffort: 'xhigh' }];
  for (const effort of [undefined, null, 'none', 'minimal']) {
    values.set('legacy', JSON.stringify({ providerId: 'ai-router', modelId: 'gpt-5.6-sol', reasoningEffort: effort }));
    assert.equal(resolveRunConfigSelection('legacy', withDefault, agents, 'agent-default').reasoningEffort, 'xhigh');
    assert.equal(resolveRunConfigSelection('legacy', providers, agents, 'agent-default').reasoningEffort, 'high');
  }
});
