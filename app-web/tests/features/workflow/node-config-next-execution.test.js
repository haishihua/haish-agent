import test from 'node:test';
import assert from 'node:assert/strict';
import { inheritedTaskNodeConfigs, nodeRuntimeConfigRequest, nodeRuntimeConfigsForWorkflow } from '../../../src/core/node-runtime-config.js';

const workflow = { nodes: [{ id: 'agent', type: 'agent', agent_id: 'old' }] };
const latest = { agent_id: 'new', llm_config_id: 'route', model_id: 'new-model', reasoning_effort: 'high' };
const task = {
  nodeRuntimeConfigs: { agent: latest },
  workflowRun: { nodes: { agent: { runtime_config: { agent_id: 'old', llm_config_id: 'old-route', model_id: 'old-model', reasoning_effort: 'low' } } } },
};

test('edited Agent and route survive task restoration and node rerun serialization', () => {
  const configs = inheritedTaskNodeConfigs(workflow, task);
  assert.deepEqual(nodeRuntimeConfigRequest(configs.agent).nodeRuntimeConfig, latest);
});

test('new input inherits the edited configuration instead of the last execution', () => {
  const configs = inheritedTaskNodeConfigs(workflow, task);
  assert.deepEqual(nodeRuntimeConfigsForWorkflow(workflow, configs).agent, latest);
});

test('clearing a route does not resurrect the old execution route', () => {
  const configs = inheritedTaskNodeConfigs(workflow, { ...task, nodeRuntimeConfigs: { agent: { agent_id: 'new' } } });
  assert.deepEqual(configs.agent, { agent_id: 'new' });
});
