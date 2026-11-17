import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWorkflowRow } from '../../src/core/workflow-catalog/nodes.js';

test('explicit nodes never inherit unrelated preset execution references by index or identity', () => {
  const workflow = normalizeWorkflowRow({ workflow_id: 'qa', nodes: [
    { id: 'start', type: 'start' },
    { id: 'output', type: 'output', output: '{{input.message}}' },
    { id: 'agent_1', type: 'agent', input: '{{input.message}}' },
    { id: 'condition_1', type: 'condition', expression: 'true' },
  ], edges: [] });
  assert.equal(JSON.stringify(workflow.nodes).includes('nodes.agent.'), false);
  assert.equal(workflow.nodes[2].output_mapping, undefined);
  assert.equal(workflow.nodes[3].expression, 'true');
  assert.deepEqual(normalizeWorkflowRow(workflow).nodes, workflow.nodes);
});
