import test from 'node:test';
import assert from 'node:assert/strict';
import { inheritedTaskNodeConfigs } from '../../../src/core/node-runtime-config.js';

const workflow = { nodes: [{ id: 'agent', type: 'agent', agent_id: 'default' }, { id: 'judge', type: 'llm', runtime_config_from: 'agent' }] };
const route = { agent_id: 'chosen-agent', llm_config_id: 'record', model_id: 'chosen-model', reasoning_effort: 'low' };
test('new task inherits current executed Agent and model, not stale draft defaults', () => {
  const task = { workflowRun: { nodes: { agent: { runtime_config: route } } } };
  const original = structuredClone(task);
  const next = inheritedTaskNodeConfigs(workflow, task, { agent: { agent_id: 'stale', llm_config_id: 'old', model_id: 'old' } });
  assert.deepEqual(next.agent, route);
  assert.equal(next.judge, undefined, 'Judge stays inherited, not frozen to an override');
  assert.deepEqual(task, original);
});
test('new task retains unsent selection and independent Judge override', () => {
  const configs = { agent: route, judge: { llm_config_id: 'judge-record', model_id: 'judge-model' } };
  const next = inheritedTaskNodeConfigs(workflow, null, configs);
  assert.deepEqual(next.agent, route);
  assert.equal(next.judge.model_id, 'judge-model');
});
