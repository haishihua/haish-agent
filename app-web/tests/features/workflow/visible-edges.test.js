import test from 'node:test';
import assert from 'node:assert/strict';
import { workflowVisibleEdges } from '../../../src/core/workflow-visible-edges.js';
test('unlimited loops hide only exhaustion; zero and finite limits keep it', () => {
  const edges = [{ from: 'retry', to: 'agent', branch: 'retry' }, { from: 'retry', to: 'end', branch: 'exhausted' }, { from: 'gate', to: 'end' }];
  for (const max_loops of [null, undefined]) {
    const workflow = { nodes: [{ id: 'retry', type: 'loop', max_loops }], edges };
    assert.deepEqual(workflowVisibleEdges(workflow), [edges[0], edges[2]]);
    assert.equal(workflow.edges.length, 3);
  }
  for (const max_loops of [0, 1, 10]) assert.deepEqual(workflowVisibleEdges({ nodes: [{ id: 'retry', type: 'loop', max_loops }], edges }), edges);
});
