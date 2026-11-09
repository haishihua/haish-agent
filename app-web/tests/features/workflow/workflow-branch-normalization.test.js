import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWorkflowEdge } from '../../../src/core/workflow-catalog/nodes.js';
import { payloadForCustomWorkflow } from '../../../src/core/workflow-catalog/payload.js';

test('工作流读入与保存共用合法分支，但各自保留原先的归一化语义', () => {
  const branches = ['true', 'false', 'approved', 'rejected', 'retry', 'exhausted'];
  for (const branch of branches) {
    assert.equal(normalizeWorkflowEdge({ from: 'a', to: 'b', branch }).branch, branch);
  }
  assert.equal(normalizeWorkflowEdge({ source: ' a ', target: ' b ', source_handle: ' DEFAULT ' }).branch, 'false');
  assert.equal(normalizeWorkflowEdge({ from: 'a', to: 'b', branch: ' RETRY ' }).branch, 'retry');
  assert.deepEqual(normalizeWorkflowEdge({ from: 'a', to: 'b', branch: 'unknown' }), { from: 'a', to: 'b' });
  const payload = payloadForCustomWorkflow({
    workflow_id: 'workflow', display_name: 'Workflow',
    edges: [...branches, ' RETRY ', 'default', 'unknown', null].map((branch) => ({ from: 'a', to: 'b', branch })),
  });
  assert.deepEqual(payload.edges.map((edge) => edge.branch), [...branches, undefined, undefined, undefined, undefined]);
});
