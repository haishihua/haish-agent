import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeWorkflowEdge, payloadForCustomWorkflow } from './workflow-catalog.js';

const editorSource = fs.readFileSync(
  new URL('../features/settings/WorkflowConfigEditor.jsx', import.meta.url),
  'utf8',
);

test('workflow editor exposes approval and loop branch ports with an optional loop limit', () => {
  assert.match(editorSource, /human_approval: \['approved', 'rejected'\]/);
  assert.match(editorSource, /loop: \['retry', 'exhausted'\]/);
  assert.match(editorSource, /baseType === 'loop'/);
  assert.match(editorSource, /selectedNode\.type === 'loop'/);
  assert.match(editorSource, /max_loops: 3/);
  assert.match(editorSource, /label: 'Unlimited'/);
  assert.match(editorSource, /max_loops: value === 'unlimited' \? null : 3/);
  assert.doesNotMatch(editorSource, /max_attempts/);
});

test('workflow nodes keep explicit branch ports and align retry routing independently', () => {
  assert.match(editorSource, /<Handle type="target" position=\{resolvedTargetPosition\} \/>/);
  assert.match(editorSource, /branchSourcePositions\[branch\] \|\| \(index === 0 \? resolvedSourcePosition : Position\.Bottom\)/);
  assert.doesNotMatch(editorSource, /workflow-condition-target-handle/);
  assert.match(editorSource, /targetHandle: feedback \? 'runtime-feedback'/);
  assert.match(editorSource, /branchHandleStyles\[branch\] \|\| \(index === 1 \? \{ left: '50%' \} : undefined\)/);
  assert.match(editorSource, /const reworkEdge = sourceLayout\?\.kind !== targetLayout\?\.kind/);
  assert.match(editorSource, /borderRadius: 18, offset: reworkEdge \? 0 : 28/);
  assert.doesNotMatch(editorSource, /calc\(100% - 18px\)/);
});

test('workflow serialization preserves explicit approval and loop branches', () => {
  for (const branch of ['approved', 'rejected', 'retry', 'exhausted']) {
    assert.deepEqual(normalizeWorkflowEdge({ from: 'a', to: 'b', branch }), {
      from: 'a',
      to: 'b',
      branch,
    });
  }

  const payload = payloadForCustomWorkflow({
    workflow_id: 'custom.loop',
    display_name: 'Loop',
    nodes: [{ id: 'loop', type: 'loop', max_loops: null }],
    edges: [
      { from: 'approve', to: 'loop', branch: 'rejected' },
      { from: 'loop', to: 'task', branch: 'retry' },
      { from: 'loop', to: 'output', branch: 'exhausted' },
    ],
  });
  assert.deepEqual(payload.edges.map((edge) => edge.branch), ['rejected', 'retry', 'exhausted']);
  assert.equal(payload.nodes[0].max_loops, null);
});
