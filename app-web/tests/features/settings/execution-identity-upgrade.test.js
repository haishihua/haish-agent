import test from 'node:test';
import assert from 'node:assert/strict';
import { savedExecutionConfigId, migrateExecutionRoute } from '../../../src/features/settings/model/execution-identity.js';
import { runtimeLlmProviderOptions } from '../../../src/features/settings/model/llm-settings.js';
import { executionConfigError } from '../../../src/features/workflow/model/execution-config.js';
import { nodeRuntimeConfigRequest, nodeRuntimeConfigsForWorkflow, workflowNodeRuntimeConfig } from '../../../src/features/workflow/model/node-runtime-config.js';
globalThis.window = { localStorage: { getItem: () => null } };
const { resolveRunConfigSelection, storedRunConfigRequest } = await import('../../../src/features/chat/hooks/useRunConfig.js');

const options = runtimeLlmProviderOptions({ chat: { id: 'record-a', provider: 'custom', name: 'renamed',
  model: 'new-default', reasoning_effort: 'xhigh', legacy_selectors: ['custom:router'] } });

const workflow = (node) => ({ nodes: [{ id: 'worker', ...node }] });

test('identity compatibility consumes only exact ids or frozen backend aliases', () => {
  assert.equal(savedExecutionConfigId('record-a', options), 'record-a');
  assert.equal(savedExecutionConfigId('custom:router', options), '');
  assert.equal(savedExecutionConfigId('custom:router', options, true), 'record-a');
  for (const selector of ['', 'auto', 'custom', 'custom:renamed', 'new-default', 'gone']) {
    assert.equal(savedExecutionConfigId(selector, options, true), '');
  }
  assert.equal(savedExecutionConfigId('custom:router', [...options, { id: 'record-b', legacySelectors: ['custom:router'] }], true), '');
  assert.equal(savedExecutionConfigId('custom:router', [{ ...options[0], legacySelectors: [] }], true), '');
  const invalid = { llm_config_id: 'gone', provider: 'custom:router', model_id: 'private-model' };
  assert.deepEqual(migrateExecutionRoute(invalid, options), invalid);
  assert.deepEqual(migrateExecutionRoute({ llm_config_id: 'custom:router' }, options), { llm_config_id: 'custom:router' });
});

test('original failing legacy Agent and LLM definitions now pass the frontend preflight', () => {
  for (const selector of ['record-a', 'custom:router']) {
    for (const type of ['agent', 'llm']) {
      const node = type === 'agent'
        ? { type, runtime_config: { provider: selector, model_id: 'private-model' } }
        : { type, provider: selector, model: 'private-model' };
      assert.equal(executionConfigError({ executionMode: 'bot', workflow: workflow(node), providerOptions: options }), '');
      assert.equal(node.provider || node.runtime_config.provider, selector); // No mutation of saved definitions.
    }
  }
});

test('legacy node projection and save/rerun request use the same record and effort', () => {
  const route = { provider: 'custom:router', model_id: 'private-model', reasoning_effort: null };
  const expected = { llm_config_id: 'record-a', model_id: 'private-model', reasoning_effort: 'xhigh' };
  const graph = workflow({ type: 'agent', runtime_config: route });
  assert.equal(workflowNodeRuntimeConfig(graph.nodes[0], null, {}, false, options).llm_config_id, 'record-a');
  assert.deepEqual(nodeRuntimeConfigsForWorkflow(graph, { worker: route }, options).worker, expected);
  assert.deepEqual(nodeRuntimeConfigRequest(route, options).nodeRuntimeConfig, expected);
  assert.equal(route.provider, 'custom:router');
});

test('unavailable/conflicting nodes cannot borrow task defaults or another configuration', () => {
  for (const type of ['agent', 'llm']) {
    for (const selector of ['gone', 'custom:renamed']) {
      const node = type === 'agent' ? { type, runtime_config: { provider: selector, model_id: 'private-model' } }
        : { type, provider: selector, model: 'private-model' };
      assert.match(executionConfigError({ executionMode: 'bot', workflow: workflow(node), providerOptions: options,
        provider: 'record-a', modelId: 'private-model' }), /configuration/);
    }
    const own = { llm_config_id: 'record-a', provider: 'custom:router', model_id: 'private-model' };
    const conflicting = type === 'agent' ? { type, runtime_config: own } : { type, ...own, model: 'private-model' };
    assert.match(executionConfigError({ executionMode: 'bot', workflow: workflow(conflicting), providerOptions: options }), /conflicting/);
    const withoutModel = type === 'agent' ? { type, runtime_config: { provider: 'record-a' } } : { type, provider: 'record-a' };
    assert.match(executionConfigError({ executionMode: 'bot', workflow: workflow(withoutModel), providerOptions: options,
      provider: 'record-a', modelId: 'private-model' }), /concrete model/);
  }
});

test('old cached selections migrate without changing the model or borrowing a replacement', () => {
  const values = new Map();
  const previous = globalThis.window;
  globalThis.window = { localStorage: { getItem: key => values.get(key) || null } };
  try {
    values.set('old', JSON.stringify({ providerId: 'custom:router', modelId: 'private-model', reasoningEffort: 'low' }));
    const restored = resolveRunConfigSelection('old', options, [], 'agent');
    assert.equal(restored.providerId, 'record-a');
    assert.equal(restored.modelId, 'private-model');
    assert.equal(restored.reasoningEffort, 'low');
    assert.equal(storedRunConfigRequest('old', options).provider, 'record-a');
    const replacement = [{ ...options[0], id: 'replacement', legacySelectors: [] }];
    assert.equal(resolveRunConfigSelection('old', replacement, [], 'agent').providerId, 'custom:router');
    assert.equal(storedRunConfigRequest('old', replacement), null);
  } finally {
    globalThis.window = previous;
  }
});
