import test from 'node:test';
import assert from 'node:assert/strict';
import { workflowNodeRuntimeConfig } from '../../../src/features/workflow/model/node-runtime-config.js';
import { runtimeProviderDisplay } from '../../../src/features/workflow/model/runtime-provider-display.js';

const node = { id: 'worker', type: 'agent' };
const providers = [
  { id: 'source', requestProvider: 'source', legacySelectors: ['custom.source'], provider: 'openai', label: 'Source Provider' },
  { id: 'executed', requestProvider: 'executed', provider: 'openai', label: 'Executed Provider' },
];
const requested = { llm_config_id: 'source', model_id: 'requested-model', reasoning_effort: 'high' };

function displaySnapshot(snapshot) {
  const configs = { worker: { ...requested } };
  const task = {
    requestedProvider: 'source', requestedModelId: 'default-model', requestedReasoningEffort: 'high',
    workflowRun: { nodes: { worker: { runtime_config: { ...snapshot } } } },
  };
  const original = structuredClone({ task, configs });
  const value = workflowNodeRuntimeConfig(node, task, configs, true, providers);
  assert.deepEqual({ task, configs }, original, 'display must not mutate requested or executed snapshots');
  assert.deepEqual(workflowNodeRuntimeConfig(node, task, configs, false, providers), requested, 'editable config must not borrow an execution snapshot');
  return value;
}

test('actual record identity, model and effort override the requested route together', () => {
  const actual = { llm_config_id: 'executed', model_id: 'actual-model', reasoning_effort: 'low' };
  const value = displaySnapshot(actual);
  assert.deepEqual(value, actual);
  assert.equal(runtimeProviderDisplay(value.llm_config_id, providers, true).label, 'Executed Provider');
});

test('actual legacy route replaces the requested record before exact-ID or frozen-alias migration', () => {
  for (const provider of ['source', 'custom.source', 'executed']) {
    const value = displaySnapshot({ provider, model_id: 'legacy-model', reasoning_effort: 'medium' });
    assert.deepEqual(value, { llm_config_id: provider === 'executed' ? 'executed' : 'source', model_id: 'legacy-model', reasoning_effort: 'medium' });
    assert.equal(runtimeProviderDisplay(value.llm_config_id, providers, true).label, provider === 'executed' ? 'Executed Provider' : 'Source Provider');
  }
});

test('unresolved actual identities remain visible and never inherit the requested provider', () => {
  for (const snapshot of [
    { provider: 'custom.unmapped', model_id: 'unmapped-model', reasoning_effort: 'xhigh' },
    { llm_config_id: 'custom.source', model_id: 'invalid-id-model', reasoning_effort: 'high' },
  ]) {
    const value = displaySnapshot(snapshot);
    assert.deepEqual(value, snapshot);
    const identity = value.llm_config_id || value.provider;
    assert.deepEqual(runtimeProviderDisplay(identity, providers, true), { selected: null, label: identity, provider: 'custom' });
  }
});

test('a partial actual route does not borrow the requested model or reasoning effort', () => {
  assert.deepEqual(displaySnapshot({ provider: 'executed' }), { llm_config_id: 'executed', model_id: '' });
  assert.deepEqual(displaySnapshot({ model_id: 'same-route-model' }), { ...requested, model_id: 'same-route-model' });
});
